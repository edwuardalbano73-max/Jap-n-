// ============================================================
// 🌸 MADOKAMI — DISCORD BOT
// Prefix: m!
// discord.js v14
// ============================================================

const {
  Client,
  GatewayIntentBits,
  Partials,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ChannelType,
  Events
} = require("discord.js");

const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// CONFIG
// ============================================================

const PREFIX = "m!";
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, "madokami-data.json");

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.GuildMember,
    Partials.User
  ]
});

// ============================================================
// BASE DE DATOS
// ============================================================

let db = {};

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } else {
      db = {};
      saveDB();
    }
  } catch (err) {
    console.error("Error cargando DB:", err);
    db = {};
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (err) {
    console.error("Error guardando DB:", err);
  }
}

function guildData(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      config: {
        prefix: PREFIX,
        antiLink: false,
        antiSpam: false,
        logChannel: null,
        welcome: false,
        welcomeChannel: null,
        welcomeMessage: "🌸 Bienvenido/a {user} a {server}!",
        autoRole: null,
        mutedRole: null
      },
      users: {},
      warns: {},
      messages: 0
    };
  }

  return db[guildId];
}

function userData(guildId, userId) {
  const g = guildData(guildId);

  if (!g.users[userId]) {
    g.users[userId] = {
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      messages: 0,
      commands: 0,
      earned: 0,
      spent: 0,
      dailyAt: 0,
      workAt: 0,
      transactions: [],
      joinedAt: Date.now()
    };
  }

  return g.users[userId];
}

loadDB();

// ============================================================
// UTILIDADES
// ============================================================

const COLOR = 0xE8A7FF;
const DARK = 0x8E44AD;

function embed(title, description = "") {
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function errorEmbed(text) {
  return new EmbedBuilder()
    .setColor(0xFF4D6D)
    .setTitle("❌ Error")
    .setDescription(text);
}

function successEmbed(text) {
  return new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle("✅ Madokami")
    .setDescription(text);
}

function money(n) {
  return `${Number(n || 0).toLocaleString("es-ES")} 💰`;
}

function mentionUser(message, args) {
  const member = message.mentions.members.first();

  if (member) return member;

  const id = args[0]?.replace(/[<@!>]/g, "");

  if (id && /^\d{17,20}$/.test(id)) {
    return message.guild.members.cache.get(id) || null;
  }

  return null;
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function hasPermission(member, permission) {
  return member.permissions.has(permission);
}

function reasonFrom(args, start = 1) {
  return args.slice(start).join(" ") || "Sin razón especificada";
}

function truncate(text, max = 900) {
  text = String(text ?? "");
  return text.length > max ? text.slice(0, max - 3) + "..." : text;
}

function formatDuration(ms) {
  let seconds = Math.floor(ms / 1000);

  const d = Math.floor(seconds / 86400);
  seconds %= 86400;

  const h = Math.floor(seconds / 3600);
  seconds %= 3600;

  const m = Math.floor(seconds / 60);
  seconds %= 60;

  const parts = [];

  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (seconds) parts.push(`${seconds}s`);

  return parts.join(" ") || "0s";
}

function addTransaction(user, text, amount) {
  user.transactions.unshift({
    text,
    amount,
    at: Date.now()
  });

  user.transactions = user.transactions.slice(0, 20);
}

function addXP(guildId, userId, amount) {
  const u = userData(guildId, userId);

  u.xp += amount;

  let needed = u.level * 100;

  while (u.xp >= needed) {
    u.xp -= needed;
    u.level++;
    needed = u.level * 100;
  }

  saveDB();

  return u.level;
}

function cooldown(user, key, ms) {
  const now = Date.now();

  if (!user[key]) {
    user[key] = now;
    return true;
  }

  if (now - user[key] < ms) {
    return false;
  }

  user[key] = now;
  return true;
}

async function sendLog(guild, title, description, color = COLOR) {
  try {
    const data = guildData(guild.id);
    const channelId = data.config.logChannel;

    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) return;

    const text = truncate(description, 3800);

    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(text)
          .setTimestamp()
      ]
    });
  } catch (err) {
    console.error("Error en logs:", err);
  }
}

// ============================================================
// COMMAND REGISTRY
// ============================================================

const commands = new Map();
const categories = {
  "💰 Economía": [],
  "🎮 Diversión": [],
  "👥 Social": [],
  "⭐ Niveles": [],
  "📚 Información": [],
  "🛠️ Utilidades": [],
  "🌸 Madokami": [],
  "🤖 IA": []
};

function register(category, names, handler, description = "") {
  if (!Array.isArray(names)) names = [names];

  for (const name of names) {
    commands.set(name, {
      name,
      category,
      handler,
      description
    });

    if (categories[category] && !categories[category].includes(name)) {
      categories[category].push(name);
    }
  }
}

// ============================================================
// 💰 ECONOMÍA — 25
// ============================================================

register("💰 Economía", "balance", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💰 Tu balance",
        `**Billetera:** ${money(u.wallet)}\n**Banco:** ${money(u.bank)}\n**Total:** ${money(u.wallet + u.bank)}`
      )
    ]
  });
}, "Muestra tu dinero.");

register("💰 Economía", "work", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  if (!cooldown(u, "workAt", 30000)) {
    return m.reply({
      embeds: [errorEmbed("⏳ Debes esperar 30 segundos para volver a trabajar.")]
    });
  }

  const amount = Math.floor(Math.random() * 201) + 100;

  u.wallet += amount;
  u.earned += amount;

  addTransaction(u, "Trabajo", amount);
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`💼 Trabajaste y ganaste **${money(amount)}**.`)
    ]
  });
}, "Trabaja y gana dinero.");

register("💰 Economía", "daily", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  if (!cooldown(u, "dailyAt", 86400000)) {
    const remaining = 86400000 - (Date.now() - u.dailyAt);

    return m.reply({
      embeds: [
        errorEmbed(`⏳ Tu recompensa diaria estará disponible en **${formatDuration(remaining)}**.`)
      ]
    });
  }

  const amount = 500;

  u.wallet += amount;
  u.earned += amount;

  addTransaction(u, "Recompensa diaria", amount);
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🎁 Recibiste tu recompensa diaria: **${money(amount)}**.`)
    ]
  });
}, "Recompensa diaria.");

register("💰 Economía", "pay", async (m, args) => {
  const target = mentionUser(m, args);

  if (!target || target.id === m.author.id) {
    return m.reply({
      embeds: [errorEmbed("Usa `m!pay @usuario cantidad`.")]
    });
  }

  const amount = Number(args[1]);

  if (!Number.isInteger(amount) || amount <= 0) {
    return m.reply({
      embeds: [errorEmbed("La cantidad debe ser un número positivo.")]
    });
  }

  const sender = userData(m.guild.id, m.author.id);
  const receiver = userData(m.guild.id, target.id);

  if (sender.wallet < amount) {
    return m.reply({
      embeds: [errorEmbed("No tienes suficiente dinero.")]
    });
  }

  sender.wallet -= amount;
  sender.spent += amount;
  receiver.wallet += amount;
  receiver.earned += amount;

  addTransaction(sender, `Pago a ${target.user.tag}`, -amount);
  addTransaction(receiver, `Pago de ${m.author.tag}`, amount);

  saveDB();

  return m.reply({
    embeds: [
      successEmbed(
        `💸 ${m.author} envió **${money(amount)}** a ${target}.`
      )
    ]
  });
}, "Envía dinero a otro usuario.");

register("💰 Economía", "give", async (m, args) => {
  const target = mentionUser(m, args);

  if (!target) {
    return m.reply({
      embeds: [errorEmbed("Usa `m!give @usuario cantidad`.")]
    });
  }

  const amount = Number(args[1]);

  if (!Number.isInteger(amount) || amount <= 0) {
    return m.reply({
      embeds: [errorEmbed("Cantidad inválida.")]
    });
  }

  const sender = userData(m.guild.id, m.author.id);
  const receiver = userData(m.guild.id, target.id);

  if (sender.wallet < amount) {
    return m.reply({
      embeds: [errorEmbed("No tienes suficiente dinero.")]
    });
  }

  sender.wallet -= amount;
  receiver.wallet += amount;

  sender.spent += amount;
  receiver.earned += amount;

  addTransaction(sender, `Transferencia a ${target.user.tag}`, -amount);
  addTransaction(receiver, `Transferencia de ${m.author.tag}`, amount);

  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🎁 Transferiste ${money(amount)} a ${target}.`)
    ]
  });
}, "Transfiere dinero.");

register("💰 Economía", "deposit", async (m, args) => {
  const u = userData(m.guild.id, m.author.id);

  let amount = args[0] === "all" ? u.wallet : Number(args[0]);

  if (!Number.isInteger(amount) || amount <= 0 || amount > u.wallet) {
    return m.reply({
      embeds: [errorEmbed("Cantidad inválida.")]
    });
  }

  u.wallet -= amount;
  u.bank += amount;

  addTransaction(u, "Depósito bancario", 0);
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🏦 Depositaste **${money(amount)}** en el banco.`)
    ]
  });
}, "Deposita dinero.");

register("💰 Economía", "withdraw", async (m, args) => {
  const u = userData(m.guild.id, m.author.id);

  let amount = args[0] === "all" ? u.bank : Number(args[0]);

  if (!Number.isInteger(amount) || amount <= 0 || amount > u.bank) {
    return m.reply({
      embeds: [errorEmbed("Cantidad inválida.")]
    });
  }

  u.bank -= amount;
  u.wallet += amount;

  addTransaction(u, "Retiro bancario", 0);
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🏧 Retiraste **${money(amount)}**.`)
    ]
  });
}, "Retira dinero del banco.");

register("💰 Economía", "bank", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "🏦 Banco",
        `Dinero guardado: **${money(u.bank)}**`
      )
    ]
  });
}, "Muestra tu banco.");

register("💰 Economía", "savings", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💎 Ahorros",
        `Tus ahorros actuales son **${money(u.bank)}**.`
      )
    ]
  });
}, "Muestra tus ahorros.");

register("💰 Economía", "money", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💰 Dinero",
        `Tienes **${money(u.wallet)}** disponibles.`
      )
    ]
  });
}, "Muestra tu dinero.");

register("💰 Economía", "wallet", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "👛 Billetera",
        `Billetera: **${money(u.wallet)}**`
      )
    ]
  });
}, "Muestra tu billetera.");

register("💰 Economía", "cash", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💵 Efectivo",
        `Efectivo disponible: **${money(u.wallet)}**`
      )
    ]
  });
}, "Muestra tu efectivo.");

register("💰 Economía", "coins", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "🪙 Monedas",
        `Monedas totales: **${money(u.wallet + u.bank)}**`
      )
    ]
  });
}, "Muestra tus monedas.");

register("💰 Economía", "wealth", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💎 Patrimonio",
        `Tu patrimonio total es **${money(u.wallet + u.bank)}**.`
      )
    ]
  });
}, "Muestra tu patrimonio.");

register("💰 Economía", "job", async (m) => {
  const jobs = [
    "Programador",
    "Diseñador",
    "Arquitecto",
    "Chef",
    "Fotógrafo",
    "Desarrollador",
    "Artista",
    "Músico"
  ];

  const job = jobs[m.author.id.length % jobs.length];

  return m.reply({
    embeds: [
      embed(
        "💼 Tu profesión",
        `Tu profesión actual es **${job}**.`
      )
    ]
  });
}, "Muestra tu profesión.");

register("💰 Economía", "salary", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💵 Salario",
        `Tu salario por trabajo está entre **100 y 300 💰**.`
      )
    ]
  });
}, "Muestra tu salario.");

register("💰 Economía", "income", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📈 Ingresos",
        `Has ganado aproximadamente **${money(u.earned)}**.`
      )
    ]
  });
}, "Muestra tus ingresos.");

register("💰 Economía", "transactions", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  const list = u.transactions.length
    ? u.transactions
        .slice(0, 10)
        .map((x, i) => `${i + 1}. ${x.text}`)
        .join("\n")
    : "No tienes transacciones.";

  return m.reply({
    embeds: [
      embed("📜 Transacciones", list)
    ]
  });
}, "Muestra tus últimas transacciones.");

register("💰 Economía", "financial", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📊 Resumen financiero",
        `💰 Billetera: **${money(u.wallet)}**\n` +
        `🏦 Banco: **${money(u.bank)}**\n` +
        `📈 Ganado: **${money(u.earned)}**\n` +
        `📉 Gastado: **${money(u.spent)}**`
      )
    ]
  });
}, "Resumen financiero.");

register("💰 Economía", "economyinfo", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "💰 Economía de Madokami",
        "Puedes trabajar, reclamar recompensas, guardar dinero en el banco y transferir dinero a otros usuarios.\n\n" +
        "Madokami utiliza únicamente moneda virtual del servidor."
      )
    ]
  });
}, "Información de la economía.");

register("💰 Economía", "richest", async (m) => {
  const users = Object.entries(guildData(m.guild.id).users)
    .sort((a, b) =>
      (b[1].wallet + b[1].bank) -
      (a[1].wallet + a[1].bank)
    )
    .slice(0, 10);

  const text = users.length
    ? users.map((x, i) =>
        `**${i + 1}.** <@${x[0]}> — ${money(x[1].wallet + x[1].bank)}`
      ).join("\n")
    : "Todavía no hay datos.";

  return m.reply({
    embeds: [embed("👑 Usuarios más ricos", text)]
  });
}, "Ranking de riqueza.");

register("💰 Economía", "leaderboard", async (m) => {
  const users = Object.entries(guildData(m.guild.id).users)
    .sort((a, b) => b[1].wallet - a[1].wallet)
    .slice(0, 10);

  const text = users.length
    ? users.map((x, i) =>
        `**${i + 1}.** <@${x[0]}> — ${money(x[1].wallet)}`
      ).join("\n")
    : "No hay datos.";

  return m.reply({
    embeds: [embed("🏆 Ranking económico", text)]
  });
}, "Ranking económico.");

register("💰 Economía", "moneystats", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📊 Estadísticas económicas",
        `💰 Total: **${money(u.wallet + u.bank)}**\n` +
        `📈 Ganado: **${money(u.earned)}**\n` +
        `📉 Gastado: **${money(u.spent)}**\n` +
        `📜 Transacciones: **${u.transactions.length}**`
      )
    ]
  });
}, "Estadísticas económicas.");

// ============================================================
// 🎮 DIVERSIÓN — 25
// ============================================================

register("🎮 Diversión", "8ball", async (m, args) => {
  if (!args.length) return m.reply("❓ Haz una pregunta.");

  const answers = [
    "Sí.",
    "No.",
    "Probablemente.",
    "No estoy seguro.",
    "Definitivamente.",
    "Puede ser.",
    "Las posibilidades son altas.",
    "Pregunta más tarde."
  ];

  return m.reply({
    embeds: [
      embed(
        "🎱 Bola mágica",
        answers[Math.floor(Math.random() * answers.length)]
      )
    ]
  });
}, "Pregunta a la bola mágica.");

register("🎮 Diversión", "coinflip", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🪙 Moneda",
        Math.random() < 0.5 ? "🟣 Cara" : "⚪ Cruz"
      )
    ]
  });
}, "Lanza una moneda virtual.");

register("🎮 Diversión", "dice", async (m, args) => {
  let sides = Number(args[0]) || 6;

  if (sides < 2 || sides > 1000) sides = 6;

  const result = Math.floor(Math.random() * sides) + 1;

  return m.reply({
    embeds: [
      embed("🎲 Dado", `Resultado: **${result}** / ${sides}`)
    ]
  });
}, "Tira un dado.");

register("🎮 Diversión", "roll", async (m, args) => {
  let max = Number(args[0]) || 100;

  if (max < 1 || max > 1000000) max = 100;

  const result = Math.floor(Math.random() * max) + 1;

  return m.reply({
    embeds: [
      embed("🎲 Roll", `Resultado: **${result}**`)
    ]
  });
}, "Número aleatorio.");

register("🎮 Diversión", "choose", async (m, args) => {
  const text = args.join(" ");

  const options = text
    .split("|")
    .map(x => x.trim())
    .filter(Boolean);

  if (options.length < 2) {
    return m.reply("Usa `m!choose pizza | hamburguesa`.");
  }

  return m.reply({
    embeds: [
      embed(
        "🤔 Elección",
        `Elegí: **${options[Math.floor(Math.random() * options.length)]}**`
      )
    ]
  });
}, "Elige entre opciones.");

register("🎮 Diversión", "joke", async (m) => {
  const jokes = [
    "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
    "¿Qué le dice un techo a otro? Techo de menos.",
    "¿Cuál es el colmo de un jardinero? Que siempre lo dejen plantado.",
    "¿Qué hace una computadora cuando tiene frío? Cierra Windows."
  ];

  return m.reply({
    embeds: [
      embed("😂 Chiste", jokes[Math.floor(Math.random() * jokes.length)])
    ]
  });
}, "Cuenta un chiste.");

register("🎮 Diversión", "hug", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🫂 Abrazo", `${m.author} le da un abrazo a ${target}.`)
    ]
  });
}, "Envía un abrazo.");

register("🎮 Diversión", "pat", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🌸 Pat", `${m.author} le da una palmadita a ${target}.`)
    ]
  });
}, "Da una palmadita.");

register("🎮 Diversión", "trivia", async (m) => {
  const questions = [
    ["¿Cuál es el planeta más grande?", ["Mercurio", "Júpiter", "Marte"], "Júpiter"],
    ["¿Cuántos continentes hay?", ["5", "6", "7"], "7"],
    ["¿Cuál es el océano más grande?", ["Atlántico", "Pacífico", "Índico"], "Pacífico"],
    ["¿Qué gas respiramos principalmente?", ["Oxígeno", "Nitrógeno", "Helio"], "Nitrógeno"]
  ];

  const q = questions[Math.floor(Math.random() * questions.length)];

  return m.reply({
    embeds: [
      embed(
        "🧠 Trivia",
        `**${q[0]}**\n\n${q[1].map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nRespuesta: **${q[2]}**`
      )
    ]
  });
}, "Pregunta de trivia.");

register("🎮 Diversión", "guess", async (m) => {
  const n = Math.floor(Math.random() * 10) + 1;

  return m.reply({
    embeds: [
      embed(
        "🔢 Adivina",
        `Estoy pensando en un número del **1 al 10**.\n\nMi número era: **${n}**.`
      )
    ]
  });
}, "Juego de adivinanza.");

register("🎮 Diversión", "random", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🎲 Random",
        `Tu número aleatorio es **${Math.floor(Math.random() * 100) + 1}**.`
      )
    ]
  });
}, "Genera algo aleatorio.");

register("🎮 Diversión", "rate", async (m, args) => {
  const target = mentionUser(m, args) || m.member;
  const score = Math.floor(Math.random() * 101);

  return m.reply({
    embeds: [
      embed(
        "📊 Valoración",
        `${target} recibió una valoración aleatoria de **${score}/100**.`
      )
    ]
  });
}, "Valoración divertida.");

register("🎮 Diversión", "magic", async (m) => {
  const answers = [
    "✨ La magia está de tu lado.",
    "🌙 El futuro es incierto.",
    "🌸 Algo interesante podría ocurrir.",
    "⭐ Sigue adelante."
  ];

  return m.reply({
    embeds: [
      embed("🔮 Magia", answers[Math.floor(Math.random() * answers.length)])
    ]
  });
}, "Mensaje mágico.");

register("🎮 Diversión", "fortune", async (m) => {
  const fortunes = [
    "Hoy aprenderás algo nuevo.",
    "Una buena sorpresa podría aparecer.",
    "Tu esfuerzo tendrá recompensa.",
    "No abandones tus objetivos."
  ];

  return m.reply({
    embeds: [
      embed("🔮 Fortuna", fortunes[Math.floor(Math.random() * fortunes.length)])
    ]
  });
}, "Fortuna.");

register("🎮 Diversión", "hello", async (m) => {
  return m.reply({
    embeds: [
      embed("👋 Hola", `¡Hola ${m.author}! 🌸`)
    ]
  });
}, "Saluda.");

register("🎮 Diversión", "fact", async (m) => {
  const facts = [
    "Los pulpos tienen tres corazones.",
    "La luz del Sol tarda unos 8 minutos en llegar a la Tierra.",
    "Los tiburones existen desde antes que los árboles.",
    "La miel puede conservarse durante muchísimo tiempo."
  ];

  return m.reply({
    embeds: [
      embed("🧠 Dato curioso", facts[Math.floor(Math.random() * facts.length)])
    ]
  });
}, "Dato curioso.");

register("🎮 Diversión", "quote", async (m) => {
  const quotes = [
    "Cada día es una nueva oportunidad.",
    "La práctica mejora tus habilidades.",
    "Los pequeños avances también cuentan.",
    "Aprender es avanzar."
  ];

  return m.reply({
    embeds: [
      embed("💬 Frase", quotes[Math.floor(Math.random() * quotes.length)])
    ]
  });
}, "Frase.");

register("🎮 Diversión", "compliment", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  const compliments = [
    "¡Tienes una gran energía!",
    "¡Tu presencia mejora el servidor!",
    "¡Se nota que tienes creatividad!",
    "¡Hoy estás haciendo un buen trabajo!"
  ];

  return m.reply({
    embeds: [
      embed("🌟 Cumplido", `${target}: ${compliments[Math.floor(Math.random() * compliments.length)]}`)
    ]
  });
}, "Cumplido.");

register("🎮 Diversión", "roast", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  const roasts = [
    "Tu WiFi tiene más personalidad que tú. 😂",
    "Hasta el bot necesita tiempo para procesar eso. 😂",
    "Eso fue tan lento que parecía una actualización de Windows."
  ];

  return m.reply({
    embeds: [
      embed("🔥 Roast amistoso", `${target}: ${roasts[Math.floor(Math.random() * roasts.length)]}`)
    ]
  });
}, "Roast amistoso.");

register("🎮 Diversión", "emoji", async (m) => {
  const emojis = ["🌸", "✨", "🔥", "🌙", "⭐", "💜", "🎮", "😎"];

  return m.reply({
    embeds: [
      embed("😀 Emoji", emojis[Math.floor(Math.random() * emojis.length)])
    ]
  });
}, "Emoji aleatorio.");

register("🎮 Diversión", "color", async (m) => {
  const colors = [
    "Rojo 🔴",
    "Azul 🔵",
    "Verde 🟢",
    "Morado 🟣",
    "Amarillo 🟡",
    "Rosa 🩷"
  ];

  return m.reply({
    embeds: [
      embed(
        "🎨 Color",
        `Tu color es **${colors[Math.floor(Math.random() * colors.length)]}**`
      )
    ]
  });
}, "Color aleatorio.");

register("🎮 Diversión", "number", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🔢 Número",
        `Tu número aleatorio es **${Math.floor(Math.random() * 100000) + 1}**.`
      )
    ]
  });
}, "Número aleatorio.");

register("🎮 Diversión", "reverse", async (m, args) => {
  if (!args.length) return m.reply("Escribe un texto.");

  return m.reply({
    embeds: [
      embed("🔄 Reverse", args.join(" ").split("").reverse().join(""))
    ]
  });
}, "Invierte un texto.");

register("🎮 Diversión", "scramble", async (m, args) => {
  if (!args.length) return m.reply("Escribe una palabra.");

  const chars = args.join(" ").split("");

  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return m.reply({
    embeds: [
      embed("🔀 Scramble", chars.join(""))
    ]
  });
}, "Mezcla un texto.");

// ============================================================
// 👥 SOCIAL — 25
// ============================================================

register("👥 Social", "profile", async (m, args) => {
  const target = mentionUser(m, args) || m.member;
  const u = userData(m.guild.id, target.id);

  return m.reply({
    embeds: [
      embed(
        `👤 Perfil de ${target.user.username}`,
        `🪙 Dinero: **${money(u.wallet + u.bank)}**\n` +
        `⭐ Nivel: **${u.level}**\n` +
        `💬 Mensajes: **${u.messages}**\n` +
        `📈 XP: **${u.xp}**`
      )
    ]
  });
}, "Perfil de usuario.");

register("👥 Social", "social", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "👥 Social",
        `Usuario: ${target}\n` +
        `Cuenta creada: <t:${Math.floor(target.user.createdTimestamp / 1000)}:R>`
      )
    ]
  });
}, "Información social.");

register("👥 Social", "ship", async (m, args) => {
  const target = mentionUser(m, args);

  if (!target) {
    return m.reply("Usa `m!ship @usuario`.");
  }

  const score = Math.floor(Math.random() * 101);

  return m.reply({
    embeds: [
      embed(
        "💞 Compatibilidad",
        `${m.author} + ${target}\n\n**${score}%**`
      )
    ]
  });
}, "Compatibilidad amistosa.");

register("👥 Social", "say", async (m, args) => {
  if (!args.length) return m.reply("Escribe algo.");

  return m.channel.send({
    content: args.join(" ")
  });
}, "Repite un mensaje.");

register("👥 Social", "whois", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "🔎 WhoIs",
        `👤 ${target.user.tag}\n` +
        `🆔 ${target.id}\n` +
        `📅 Creada: <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`
      )
    ]
  });
}, "Busca información de usuario.");

register("👥 Social", "goodnight", async (m) => {
  return m.reply({
    embeds: [
      embed("🌙 Buenas noches", `¡Buenas noches, ${m.author}! 🌙`)
    ]
  });
}, "Buenas noches.");

register("👥 Social", "goodmorning", async (m) => {
  return m.reply({
    embeds: [
      embed("☀️ Buenos días", `¡Buenos días, ${m.author}! ☀️`)
    ]
  });
}, "Buenos días.");

register("👥 Social", "love", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("💜 Love", `${m.author} manda cariño a ${target}.`)
    ]
  });
}, "Envía cariño.");

register("👥 Social", "highfive", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("✋ High Five", `${m.author} chocó los cinco con ${target}.`)
    ]
  });
}, "Choca los cinco.");

register("👥 Social", "wave", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("👋 Saludo", `${m.author} saluda a ${target}.`)
    ]
  });
}, "Saluda.");

register("👥 Social", "clap", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("👏 Aplausos", `${m.author} aplaude a ${target}.`)
    ]
  });
}, "Aplaude.");

register("👥 Social", "smile", async (m) => {
  return m.reply({
    embeds: [
      embed("😊 Sonrisa", `${m.author} está sonriendo. 😊`)
    ]
  });
}, "Sonríe.");

register("👥 Social", "goodluck", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🍀 Buena suerte", `¡Buena suerte, ${target}! 🍀`)
    ]
  });
}, "Desea buena suerte.");

register("👥 Social", "thanks", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🙏 Gracias", `${m.author} le da las gracias a ${target}.`)
    ]
  });
}, "Da las gracias.");

register("👥 Social", "support", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("💜 Apoyo", `${m.author} apoya a ${target}.`)
    ]
  });
}, "Muestra apoyo.");

register("👥 Social", "greet", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🌸 Saludo", `¡Hola ${target}!`)
    ]
  });
}, "Saluda a alguien.");

register("👥 Social", "friend", async (m, args) => {
  const target = mentionUser(m, args);

  if (!target) return m.reply("Menciona a alguien.");

  return m.reply({
    embeds: [
      embed("🤝 Amistad", `${m.author} considera a ${target} un buen amigo/a.`)
    ]
  });
}, "Mensaje de amistad.");

register("👥 Social", "welcome", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed("🌸 Bienvenido", `¡Bienvenido/a ${target}!`)
    ]
  });
}, "Da la bienvenida.");

register("👥 Social", "activity", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "🎮 Actividad",
        `${target} está en **${target.presence?.status || "offline"}**.`
      )
    ]
  });
}, "Muestra actividad.");

register("👥 Social", "messages", async (m, args) => {
  const target = mentionUser(m, args) || m.member;
  const u = userData(m.guild.id, target.id);

  return m.reply({
    embeds: [
      embed(
        "💬 Mensajes",
        `${target} tiene **${u.messages} mensajes registrados**.`
      )
    ]
  });
}, "Mensajes de usuario.");

register("👥 Social", "socialstats", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📊 Estadísticas sociales",
        `💬 Mensajes: **${u.messages}**\n` +
        `⭐ Nivel: **${u.level}**\n` +
        `📈 XP: **${u.xp}**\n` +
        `💰 Dinero: **${money(u.wallet + u.bank)}**`
      )
    ]
  });
}, "Tus estadísticas sociales.");

register("👥 Social", "joined", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  if (!target.joinedTimestamp) {
    return m.reply("No pude obtener esa fecha.");
  }

  return m.reply({
    embeds: [
      embed(
        "📅 Entrada al servidor",
        `${target} entró <t:${Math.floor(target.joinedTimestamp / 1000)}:F>`
      )
    ]
  });
}, "Muestra cuándo entró.");

register("👥 Social", "account", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "👤 Cuenta",
        `Usuario: **${target.user.tag}**\n` +
        `ID: **${target.id}**\n` +
        `Creada: <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`
      )
    ]
  });
}, "Información de cuenta.");

register("👥 Social", "status", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "🟢 Estado",
        `${target}: **${target.presence?.status || "offline"}**`
      )
    ]
  });
}, "Estado de usuario.");

register("👥 Social", "avatar", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(`🖼️ Avatar de ${target.user.username}`)
        .setImage(target.user.displayAvatarURL({ size: 1024 }))
    ]
  });
}, "Avatar.");

register("👥 Social", "roles", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  const roles = target.roles.cache
    .filter(r => r.id !== m.guild.id)
    .map(r => r.toString())
    .join(", ") || "Sin roles.";

  return m.reply({
    embeds: [
      embed("🎭 Roles", roles)
    ]
  });
}, "Roles de usuario.");

// ============================================================
// ⭐ NIVELES — 25
// ============================================================

function levelText(u) {
  return `Nivel **${u.level}** — XP **${u.xp}/${u.level * 100}**`;
}

register("⭐ Niveles", "level", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [embed("⭐ Nivel", levelText(u))]
  });
}, "Muestra tu nivel.");

register("⭐ Niveles", "xp", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "✨ XP",
        `Tienes **${u.xp} XP**.\nNecesitas **${u.level * 100 - u.xp} XP** para subir.`
      )
    ]
  });
}, "Muestra tu XP.");

register("⭐ Niveles", "rank", async (m) => {
  const g = guildData(m.guild.id);

  const users = Object.entries(g.users)
    .sort((a, b) =>
      (b[1].level * 1000 + b[1].xp) -
      (a[1].level * 1000 + a[1].xp)
    );

  const pos = users.findIndex(x => x[0] === m.author.id) + 1;

  return m.reply({
    embeds: [
      embed(
        "🏆 Rank",
        `Tu posición es **#${pos || "?"}**.`
      )
    ]
  });
}, "Muestra tu posición.");

register("⭐ Niveles", "levels", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📈 Niveles",
        `Nivel actual: **${u.level}**\nXP: **${u.xp}**`
      )
    ]
  });
}, "Información de niveles.");

register("⭐ Niveles", "nextlevel", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "⬆️ Siguiente nivel",
        `Te faltan **${u.level * 100 - u.xp} XP**.`
      )
    ]
  });
}, "XP restante.");

register("⭐ Niveles", "myrank", async (m) => {
  return commands.get("rank").handler(m, []);
}, "Tu ranking.");

register("⭐ Niveles", "topxp", async (m) => {
  const users = Object.entries(guildData(m.guild.id).users)
    .sort((a, b) => b[1].xp - a[1].xp)
    .slice(0, 10);

  const text = users.map((x, i) =>
    `**${i + 1}.** <@${x[0]}> — ${x[1].xp} XP`
  ).join("\n") || "No hay datos.";

  return m.reply({
    embeds: [embed("🏆 Top XP", text)]
  });
}, "Top de XP.");

register("⭐ Niveles", "levelinfo", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "⭐ Información de nivel",
        `Nivel: **${u.level}**\nXP: **${u.xp}**\nMeta: **${u.level * 100} XP**`
      )
    ]
  });
}, "Información de nivel.");

register("⭐ Niveles", "progress", async (m) => {
  const u = userData(m.guild.id, m.author.id);
  const total = u.level * 100;
  const percent = Math.floor((u.xp / total) * 100);

  return m.reply({
    embeds: [
      embed(
        "📊 Progreso",
        `[${"█".repeat(Math.floor(percent / 10))}${"░".repeat(10 - Math.floor(percent / 10))}] ${percent}%`
      )
    ]
  });
}, "Progreso del nivel.");

register("⭐ Niveles", "xprequired", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "✨ XP requerida",
        `Necesitas **${u.level * 100} XP** para completar el nivel.`
      )
    ]
  });
}, "XP requerida.");

register("⭐ Niveles", "xpneeded", async (m) => {
  return commands.get("nextlevel").handler(m, []);
}, "XP restante.");

register("⭐ Niveles", "levelstats", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "📊 Estadísticas de nivel",
        `Nivel: **${u.level}**\nXP: **${u.xp}**\nMensajes: **${u.messages}**`
      )
    ]
  });
}, "Estadísticas.");

register("⭐ Niveles", "levelcheck", async (m, args) => {
  const target = mentionUser(m, args) || m.member;
  const u = userData(m.guild.id, target.id);

  return m.reply({
    embeds: [
      embed(
        "🔎 Nivel",
        `${target} está en el nivel **${u.level}** con **${u.xp} XP**.`
      )
    ]
  });
}, "Comprueba el nivel.");

register("⭐ Niveles", "mylevel", async (m) => {
  return commands.get("level").handler(m, []);
}, "Tu nivel.");

register("⭐ Niveles", "myxp", async (m) => {
  return commands.get("xp").handler(m, []);
}, "Tu XP.");

register("⭐ Niveles", "xprank", async (m) => {
  return commands.get("topxp").handler(m, []);
}, "Ranking XP.");

register("⭐ Niveles", "toplevels", async (m) => {
  const users = Object.entries(guildData(m.guild.id).users)
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, 10);

  const text = users.map((x, i) =>
    `**${i + 1}.** <@${x[0]}> — Nivel ${x[1].level}`
  ).join("\n") || "No hay datos.";

  return m.reply({
    embeds: [embed("🏆 Top niveles", text)]
  });
}, "Top niveles.");

register("⭐ Niveles", "progressbar", async (m) => {
  return commands.get("progress").handler(m, []);
}, "Barra de progreso.");

register("⭐ Niveles", "levelcard", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        `⭐ ${m.author.username}`,
        `Nivel **${u.level}**\nXP **${u.xp}/${u.level * 100}**`
      )
    ]
  });
}, "Tarjeta de nivel.");

register("⭐ Niveles", "xpstats", async (m) => {
  return commands.get("levelstats").handler(m, []);
}, "Estadísticas XP.");

register("⭐ Niveles", "rankinfo", async (m) => {
  return commands.get("rank").handler(m, []);
}, "Información de ranking.");

register("⭐ Niveles", "levelboard", async (m) => {
  return commands.get("toplevels").handler(m, []);
}, "Tabla de niveles.");

register("⭐ Niveles", "messagesxp", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "💬 XP por mensajes",
        `Mensajes registrados: **${u.messages}**\n` +
        `XP actual: **${u.xp}**`
      )
    ]
  });
}, "Mensajes y XP.");

register("⭐ Niveles", "xppermessage", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "✨ XP por mensaje",
        "Madokami otorga **5 XP** por cada mensaje registrado."
      )
    ]
  });
}, "XP por mensaje.");

register("⭐ Niveles", "levelgoal", async (m) => {
  const u = userData(m.guild.id, m.author.id);

  return m.reply({
    embeds: [
      embed(
        "🎯 Objetivo",
        `Tu objetivo es alcanzar el nivel **${u.level + 1}**.`
      )
    ]
  });
}, "Objetivo de nivel.");

// ============================================================
// 📚 INFORMACIÓN — 25
// ============================================================

register("📚 Información", "userinfo", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "👤 Información",
        `Usuario: **${target.user.tag}**\n` +
        `ID: **${target.id}**\n` +
        `Creada: <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>\n` +
        `Entrada: ${target.joinedTimestamp ? `<t:${Math.floor(target.joinedTimestamp / 1000)}:F>` : "Desconocida"}`
      )
    ]
  });
}, "Información de usuario.");

register("📚 Información", "serverinfo", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🏠 Servidor",
        `Nombre: **${m.guild.name}**\n` +
        `ID: **${m.guild.id}**\n` +
        `Miembros: **${m.guild.memberCount}**\n` +
        `Canales: **${m.guild.channels.cache.size}**\n` +
        `Roles: **${m.guild.roles.cache.size - 1}**`
      )
    ]
  });
}, "Información del servidor.");

register("📚 Información", "avatar", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(`🖼️ Avatar de ${target.user.username}`)
        .setImage(target.user.displayAvatarURL({ size: 1024 }))
    ]
  });
}, "Avatar.");

register("📚 Información", "id", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  return m.reply({
    embeds: [
      embed(
        "🆔 ID",
        `${target}: **${target.id}**`
      )
    ]
  });
}, "ID.");

register("📚 Información", "roles", async (m) => {
  const roles = m.guild.roles.cache
    .filter(r => r.id !== m.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(r => r.toString())
    .slice(0, 50);

  return m.reply({
    embeds: [
      embed("🎭 Roles", roles.join(", ") || "No hay roles.")
    ]
  });
}, "Roles.");

register("📚 Información", "channels", async (m) => {
  const channels = m.guild.channels.cache
    .map(c => `${c.type === ChannelType.GuildText ? "💬" : "🔊"} ${c.name}`)
    .slice(0, 50);

  return m.reply({
    embeds: [
      embed("📚 Canales", channels.join("\n") || "No hay canales.")
    ]
  });
}, "Canales.");

register("📚 Información", "members", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "👥 Miembros",
        `Este servidor tiene **${m.guild.memberCount} miembros**.`
      )
    ]
  });
}, "Miembros.");

register("📚 Información", "icon", async (m) => {
  return m.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR)
        .setTitle(`🖼️ Icono de ${m.guild.name}`)
        .setImage(m.guild.iconURL({ size: 1024 }) || null)
    ]
  });
}, "Icono.");

register("📚 Información", "created", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "📅 Creación",
        `Servidor creado <t:${Math.floor(m.guild.createdTimestamp / 1000)}:F>`
      )
    ]
  });
}, "Fecha de creación.");

register("📚 Información", "owner", async (m) => {
  const owner = await m.guild.fetchOwner();

  return m.reply({
    embeds: [
      embed(
        "👑 Dueño",
        `${owner.user.tag}\nID: ${owner.id}`
      )
    ]
  });
}, "Dueño.");

register("📚 Información", "boost", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🚀 Boost",
        `Nivel: **${m.guild.premiumTier}**\nBoosts: **${m.guild.premiumSubscriptionCount || 0}**`
      )
    ]
  });
}, "Boosts.");

register("📚 Información", "rolescount", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🎭 Roles",
        `Cantidad: **${m.guild.roles.cache.size - 1}**`
      )
    ]
  });
}, "Cantidad de roles.");

register("📚 Información", "channelcount", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "📚 Canales",
        `Cantidad: **${m.guild.channels.cache.size}**`
      )
    ]
  });
}, "Cantidad de canales.");

register("📚 Información", "botinfo", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🌸 Madokami",
        `Discord.js: **v14**\n` +
        `Node.js: **${process.version}**\n` +
        `Servidores: **${client.guilds.cache.size}**`
      )
    ]
  });
}, "Información del bot.");

register("📚 Información", "membercount", async (m) => {
  return m.reply({
    embeds: [
      embed("👥 Miembros", `${m.guild.memberCount}`)
    ]
  });
}, "Cantidad de miembros.");

register("📚 Información", "rolecount", async (m) => {
  return m.reply({
    embeds: [
      embed("🎭 Roles", `${m.guild.roles.cache.size - 1}`)
    ]
  });
}, "Cantidad de roles.");

register("📚 Información", "channelinfo", async (m, args) => {
  const channel = m.mentions.channels.first() ||
    m.guild.channels.cache.get(args[0]) ||
    m.channel;

  return m.reply({
    embeds: [
      embed(
        "📚 Canal",
        `Nombre: **${channel.name}**\nID: **${channel.id}**\nTipo: **${channel.type}**`
      )
    ]
  });
}, "Información de canal.");

register("📚 Información", "serverid", async (m) => {
  return m.reply({
    embeds: [embed("🆔 Server ID", m.guild.id)]
  });
}, "ID del servidor.");

register("📚 Información", "servericon", async (m) => {
  return commands.get("icon").handler(m, []);
}, "Icono.");

register("📚 Información", "serverowner", async (m) => {
  return commands.get("owner").handler(m, []);
}, "Dueño.");

register("📚 Información", "memberinfo", async (m, args) => {
  return commands.get("userinfo").handler(m, args);
}, "Información.");

register("📚 Información", "botstats", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "📊 Estadísticas",
        `Servidores: **${client.guilds.cache.size}**\n` +
        `Usuarios aproximados: **${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**`
      )
    ]
  });
}, "Estadísticas.");

register("📚 Información", "guild", async (m) => {
  return commands.get("serverinfo").handler(m, []);
}, "Información del servidor.");

register("📚 Información", "information", async (m) => {
  return commands.get("serverinfo").handler(m, []);
}, "Información.");

register("📚 Información", "permissions", async (m, args) => {
  const target = mentionUser(m, args) || m.member;

  const perms = target.permissions.toArray();

  return m.reply({
    embeds: [
      embed(
        "🔐 Permisos",
        perms.map(p => `• ${p}`).join("\n") || "Sin permisos."
      )
    ]
  });
}, "Permisos.");

// ============================================================
// 🛠️ UTILIDADES — 25
// ============================================================

register("🛠️ Utilidades", "ping", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🏓 Pong",
        `Latencia: **${client.ws.ping}ms**`
      )
    ]
  });
}, "Latencia.");

register("🛠️ Utilidades", "poll", async (m, args) => {
  if (!args.length) {
    return m.reply("Usa `m!poll ¿pregunta?`.");
  }

  const msg = await m.channel.send({
    embeds: [
      embed("📊 Encuesta", args.join(" "))
    ]
  });

  await msg.react("👍");
  await msg.react("👎");

  return;
}, "Crea una encuesta.");

register("🛠️ Utilidades", "remind", async (m, args) => {
  const seconds = Number(args[0]);

  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
    return m.reply("Usa `m!remind segundos mensaje`.");
  }

  const text = args.slice(1).join(" ") || "Recordatorio";

  await m.reply({
    embeds: [
      successEmbed(`⏰ Te recordaré esto en **${seconds} segundos**.`)
    ]
  });

  setTimeout(() => {
    m.author.send(`⏰ **Recordatorio:** ${text}`).catch(() => {});
  }, seconds * 1000);
}, "Crea un recordatorio.");

register("🛠️ Utilidades", "time", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🕐 Hora",
        `<t:${Math.floor(Date.now() / 1000)}:F>`
      )
    ]
  });
}, "Hora actual.");

register("🛠️ Utilidades", "timestamp", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "⏱️ Timestamp",
        `<t:${Math.floor(Date.now() / 1000)}:F>\n<t:${Math.floor(Date.now() / 1000)}:R>`
      )
    ]
  });
}, "Timestamp.");

register("🛠️ Utilidades", "invite", async (m) => {
  const url =
    `https://discord.com/oauth2/authorize?client_id=${client.user.id}` +
    `&scope=bot%20applications.commands&permissions=8`;

  return m.reply({
    embeds: [
      embed(
        "🌸 Invitar Madokami",
        `[Haz clic aquí para invitar a Madokami](${url})`
      )
    ]
  });
}, "Invitación.");

register("🛠️ Utilidades", "sayembed", async (m, args) => {
  if (!args.length) return m.reply("Escribe un mensaje.");

  return m.channel.send({
    embeds: [
      embed("🌸 Madokami", args.join(" "))
    ]
  });
}, "Envía un embed.");

register("🛠️ Utilidades", "uptime", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "⏱️ Uptime",
        formatDuration(client.uptime)
      )
    ]
  });
}, "Tiempo activo.");

register("🛠️ Utilidades", "support", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "💜 Soporte",
        "Si tienes problemas con Madokami, revisa primero la configuración de permisos e intents del bot."
      )
    ]
  });
}, "Soporte.");

register("🛠️ Utilidades", "calc", async (m, args) => {
  const expression = args.join(" ");

  if (!expression) {
    return m.reply("Usa `m!calc 2 + 2`.");
  }

  if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
    return m.reply({
      embeds: [errorEmbed("Solo se permiten operaciones matemáticas básicas.")]
    });
  }

  try {
    const result = Function(`"use strict"; return (${expression})`)();

    return m.reply({
      embeds: [
        embed(
          "🧮 Calculadora",
          `\`${expression}\` = **${result}**`
        )
      ]
    });
  } catch {
    return m.reply({
      embeds: [errorEmbed("No pude calcular esa expresión.")]
    });
  }
}, "Calculadora.");

register("🛠️ Utilidades", "charcount", async (m, args) => {
  const text = args.join(" ");

  return m.reply({
    embeds: [
      embed("🔢 Caracteres", `Cantidad: **${text.length}**`)
    ]
  });
}, "Cuenta caracteres.");

register("🛠️ Utilidades", "wordcount", async (m, args) => {
  const text = args.join(" ").trim();
  const count = text ? text.split(/\s+/).length : 0;

  return m.reply({
    embeds: [
      embed("📝 Palabras", `Cantidad: **${count}**`)
    ]
  });
}, "Cuenta palabras.");

register("🛠️ Utilidades", "reverse", async (m, args) => {
  return m.reply(args.join(" ").split("").reverse().join(""));
}, "Invierte texto.");

register("🛠️ Utilidades", "uppercase", async (m, args) => {
  return m.reply(args.join(" ").toUpperCase());
}, "Mayúsculas.");

register("🛠️ Utilidades", "lowercase", async (m, args) => {
  return m.reply(args.join(" ").toLowerCase());
}, "Minúsculas.");

register("🛠️ Utilidades", "repeat", async (m, args) => {
  const count = Math.min(Number(args[0]) || 1, 10);
  const text = args.slice(1).join(" ");

  if (!text) return m.reply("Escribe un texto.");

  return m.reply({
    content: Array(count).fill(text).join("\n"),
    allowedMentions: { parse: [] }
  });
}, "Repite texto.");

register("🛠️ Utilidades", "firstword", async (m, args) => {
  return m.reply(args[0] || "No escribiste ninguna palabra.");
}, "Primera palabra.");

register("🛠️ Utilidades", "lastword", async (m, args) => {
  return m.reply(args[args.length - 1] || "No escribiste ninguna palabra.");
}, "Última palabra.");

register("🛠️ Utilidades", "length", async (m, args) => {
  return m.reply(`Longitud: **${args.join(" ").length}** caracteres.`);
}, "Longitud de texto.");

register("🛠️ Utilidades", "serverstats", async (m) => {
  return commands.get("serverinfo").handler(m, []);
}, "Estadísticas del servidor.");

register("🛠️ Utilidades", "botstats", async (m) => {
  return commands.get("botinfo").handler(m, []);
}, "Estadísticas del bot.");

register("🛠️ Utilidades", "roleinfo", async (m, args) => {
  const role =
    m.mentions.roles.first() ||
    m.guild.roles.cache.get(args[0]);

  if (!role) return m.reply("Menciona un rol.");

  return m.reply({
    embeds: [
      embed(
        "🎭 Rol",
        `Nombre: **${role.name}**\n` +
        `ID: **${role.id}**\n` +
        `Miembros: **${role.members.size}**\n` +
        `Posición: **${role.position}**`
      )
    ]
  });
}, "Información de rol.");

register("🛠️ Utilidades", "channelinfo", async (m, args) => {
  return commands.get("channelinfo").handler(m, args);
}, "Información de canal.");

register("🛠️ Utilidades", "permissions", async (m, args) => {
  return commands.get("permissions").handler(m, args);
}, "Permisos.");

register("🛠️ Utilidades", "snowflake", async (m, args) => {
  const id = args[0];

  if (!id || !/^\d{17,20}$/.test(id)) {
    return m.reply("Escribe una ID de Discord válida.");
  }

  const timestamp = Number((BigInt(id) >> 22n) + 1420070400000n);

  return m.reply({
    embeds: [
      embed(
        "❄️ Snowflake",
        `Creado aproximadamente: <t:${Math.floor(timestamp / 1000)}:F>`
      )
    ]
  });
}, "Información de Snowflake.");

// ============================================================
// 🌸 MADOKAMI — 25
// ============================================================

register("🌸 Madokami", "about", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🌸 Madokami",
        "Bot multifunción para Discord con economía, niveles, diversión, utilidades, moderación y funciones de IA."
      )
    ]
  });
}, "Sobre Madokami.");

register("🌸 Madokami", "prefix", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "⌨️ Prefix",
        `El prefix actual es **${PREFIX}**`
      )
    ]
  });
}, "Prefix.");

register("🌸 Madokami", "commands", async (m) => {
  return m.reply("Usa `m!help` para abrir el menú.");
}, "Lista de comandos.");

register("🌸 Madokami", "status", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "🟢 Estado",
        "Madokami está funcionando correctamente."
      )
    ]
  });
}, "Estado.");

register("🌸 Madokami", "server", async (m) => {
  return m.reply(`🌸 Madokami está activo en **${client.guilds.cache.size} servidores**.`);
}, "Servidores.");

register("🌸 Madokami", "bot", async (m) => {
  return commands.get("about").handler(m, []);
}, "Información del bot.");

register("🌸 Madokami", "version", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "📦 Versión",
        "Madokami **1.0.0**"
      )
    ]
  });
}, "Versión.");

register("🌸 Madokami", "statusbot", async (m) => {
  return commands.get("status").handler(m, []);
}, "Estado del bot.");

register("🌸 Madokami", "stats", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "📊 Estadísticas",
        `Servidores: **${client.guilds.cache.size}**\n` +
        `Usuarios: **${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**`
      )
    ]
  });
}, "Estadísticas.");

register("🌸 Madokami", "commandsinfo", async (m) => {
  const total = [...commands.keys()].length;

  return m.reply({
    embeds: [
      embed(
        "📚 Comandos",
        `Madokami tiene **${total} comandos registrados**.`
      )
    ]
  });
}, "Cantidad de comandos.");

register("🌸 Madokami", "developer", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "👨‍💻 Developer",
        "Proyecto Madokami."
      )
    ]
  });
}, "Developer.");

register("🌸 Madokami", "github", async (m) => {
  return m.reply({
    embeds: [
      embed(
        "💻 GitHub",
        "El código de Madokami está administrado por su desarrollador."
      )
    ]
  });
}, "GitHub.");

register("🌸 Madokami", "support", async (m) => {
  return commands.get("support").handler(m, []);
}, "Soporte.");

register("🌸 Madokami", "help", async (m) => {
  return showHelp(m);
}, "Ayuda.");

register("🌸 Madokami", "pingbot", async (m) => {
  return commands.get("ping").handler(m, []);
}, "Ping.");

register("🌸 Madokami", "uptimebot", async (m) => {
  return commands.get("uptime").handler(m, []);
}, "Uptime.");

register("🌸 Madokami", "servers", async (m) => {
  return m.reply(`🌐 Servidores: **${client.guilds.cache.size}**`);
}, "Servidores.");

register("🌸 Madokami", "users", async (m) => {
  const users = client.guilds.cache.reduce(
    (total, guild) => total + guild.memberCount,
    0
  );

  return m.reply(`👥 Usuarios aproximados: **${users}**`);
}, "Usuarios.");

register("🌸 Madokami", "channels", async (m) => {
  const count = client.guilds.cache.reduce(
    (total, guild) => total + guild.channels.cache.size,
    0
  );

  return m.reply(`📚 Canales: **${count}**`);
}, "Canales.");

register("🌸 Madokami", "latency", async (m) => {
  return m.reply(`🏓 Latencia: **${client.ws.ping}ms**`);
}, "Latencia.");

register("🌸 Madokami", "library", async (m) => {
  return m.reply("📦 Biblioteca: **discord.js v14**");
}, "Biblioteca.");

register("🌸 Madokami", "node", async (m) => {
  return m.reply(`🟢 Node.js: **${process.version}**`);
}, "Versión Node.");

register("🌸 Madokami", "runtime", async (m) => {
  return m.reply(`⏱️ Runtime: **${formatDuration(client.uptime)}**`);
}, "Runtime.");

register("🌸 Madokami", "memory", async (m) => {
  const mem = process.memoryUsage();

  return m.reply({
    embeds: [
      embed(
        "🧠 Memoria",
        `RAM usada: **${(mem.rss / 1024 / 1024).toFixed(2)} MB**`
      )
    ]
  });
}, "Memoria.");

register("🌸 Madokami", "config", async (m) => {
  const c = guildData(m.guild.id).config;

  return m.reply({
    embeds: [
      embed(
        "⚙️ Configuración",
        `Anti-link: **${c.antiLink ? "ON" : "OFF"}**\n` +
        `Anti-spam: **${c.antiSpam ? "ON" : "OFF"}**\n` +
        `Welcome: **${c.welcome ? "ON" : "OFF"}**\n` +
        `Logs: **${c.logChannel ? `<#${c.logChannel}>` : "OFF"}**`
      )
    ]
  });
}, "Configuración.");

// ============================================================
// 🤖 IA — 3 COMANDOS
// ============================================================

async function aiText(prompt) {
  if (!openai) {
    throw new Error("OPENAI_API_KEY no configurada.");
  }

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: prompt
  });

  return response.output_text || "La IA no devolvió una respuesta.";
}

register("🤖 IA", "ia", async (m, args) => {
  if (!openai) {
    return m.reply({
      embeds: [
        errorEmbed(
          "La IA no está configurada. Añade `OPENAI_API_KEY` en Render."
        )
      ]
    });
  }

  const question = args.join(" ");

  if (!question) {
    return m.reply("Usa `m!ia <pregunta>`.");
  }

  try {
    await m.channel.sendTyping();

    const answer = await aiText(
      `Responde en español de forma clara y útil.\n\nPregunta del usuario:\n${question}`
    );

    const chunks = answer.match(/[\s\S]{1,3900}/g) || [answer];

    for (const chunk of chunks.slice(0, 3)) {
      await m.channel.send({
        embeds: [
          embed("🤖 Madokami IA", chunk)
        ]
      });
    }
  } catch (err) {
    console.error("IA:", err);

    return m.reply({
      embeds: [
        errorEmbed("No pude contactar con la IA en este momento.")
      ]
    });
  }
}, "IA general: preguntas, matemáticas, explicaciones, código, etc.");

register("🤖 IA", "ask", async (m, args) => {
  if (!openai) {
    return m.reply({
      embeds: [
        errorEmbed(
          "La IA no está configurada. Añade `OPENAI_API_KEY` en Render."
        )
      ]
    });
  }

  const question = args.join(" ");

  if (!question) {
    return m.reply("Usa `m!ask <pregunta>`.");
  }

  try {
    await m.channel.sendTyping();

    const answer = await aiText(
      `Responde brevemente en español.\nPregunta: ${question}`
    );

    return m.reply({
      embeds: [
        embed("💬 Respuesta", truncate(answer, 3900))
      ]
    });
  } catch (err) {
    console.error("ASK:", err);

    return m.reply({
      embeds: [
        errorEmbed("No pude obtener una respuesta.")
      ]
    });
  }
}, "Pregunta rápida a la IA.");

register("🤖 IA", "imagen", async (m, args) => {
  if (!openai) {
    return m.reply({
      embeds: [
        errorEmbed(
          "La generación de imágenes no está configurada. Añade `OPENAI_API_KEY` en Render."
        )
      ]
    });
  }

  const prompt = args.join(" ");

  if (!prompt) {
    return m.reply("Usa `m!imagen <descripción>`.");
  }

  try {
    await m.channel.sendTyping();

    const result = await openai.images.generate({
      model: "gpt-image-2",
      prompt
    });

    const base64 = result.data?.[0]?.b64_json;

    if (!base64) {
      return m.reply({
        embeds: [
          errorEmbed("La IA no devolvió ninguna imagen.")
        ]
      });
    }

    const buffer = Buffer.from(base64, "base64");

    const attachment = new AttachmentBuilder(buffer, {
      name: "madokami-image.png"
    });

    return m.reply({
      embeds: [
        embed(
          "🎨 Imagen generada",
          `Prompt: ${truncate(prompt, 1000)}`
        )
      ],
      files: [attachment]
    });
  } catch (err) {
    console.error("IMAGEN:", err);

    return m.reply({
      embeds: [
        errorEmbed(
          "No pude generar la imagen. Comprueba que tu API de OpenAI esté configurada y tenga acceso al modelo de imágenes."
        )
      ]
    });
  }
}, "Genera una imagen mediante IA.");

// ============================================================
// 🔐 ADMINISTRACIÓN
// ============================================================

const adminCommands = [
  "ban",
  "unban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "warnings",
  "clear",
  "slowmode",
  "antilink",
  "antispam",
  "log",
  "lock",
  "unlock",
  "welcome",
  "welcomechannel",
  "welcomemessage",
  "autorole",
  "setprefix",
  "config"
];

function adminOnly(m) {
  if (!isAdmin(m.member)) {
    m.reply({
      embeds: [
        errorEmbed("🔒 Necesitas permisos de administrador.")
      ]
    });

    return false;
  }

  return true;
}

async function moderationLog(m, action, target, reason) {
  await sendLog(
    m.guild,
    `🛡️ ${action}`,
    `**Moderador:** ${m.author.tag}\n` +
    `**Usuario:** ${target || "N/A"}\n` +
    `**Canal:** ${m.channel}\n` +
    `**Razón:** ${reason || "Sin razón"}`,
    0xFFB347
  );
}

async function moderationAction(m, args, action) {
  if (!adminOnly(m)) return;

  const target = mentionUser(m, args);

  if (!target) {
    return m.reply({
      embeds: [
        errorEmbed(`Usa \`m!${action} @usuario razón\`.`)
      ]
    });
  }

  const reason = reasonFrom(args);

  try {
    if (action === "ban") {
      await target.ban({ reason });
    }

    if (action === "kick") {
      await target.kick(reason);
    }

    await moderationLog(m, action.toUpperCase(), target.user.tag, reason);

    return m.reply({
      embeds: [
        successEmbed(`✅ ${target.user.tag} ha sido ${action === "ban" ? "baneado" : "expulsado"}.`)
      ]
    });
  } catch (err) {
    return m.reply({
      embeds: [
        errorEmbed("No pude realizar la acción. Revisa mis permisos y mi posición de rol.")
      ]
    });
  }
}

registerAdmin("ban", async (m, args) => {
  return moderationAction(m, args, "ban");
});

registerAdmin("kick", async (m, args) => {
  return moderationAction(m, args, "kick");
});

function registerAdmin(name, handler) {
  commands.set(name, {
    name,
    category: "🔐 Administración",
    handler,
    description: "Comando administrativo."
  });
}

registerAdmin("unban", async (m, args) => {
  if (!adminOnly(m)) return;

  const id = args[0];

  if (!id) return m.reply("Usa `m!unban ID`.");

  try {
    await m.guild.members.unban(id);

    await sendLog(
      m.guild,
      "🔓 UNBAN",
      `**Moderador:** ${m.author.tag}\n**Usuario ID:** ${id}`
    );

    return m.reply({
      embeds: [
        successEmbed(`Usuario **${id}** desbaneado.`)
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude quitar el ban. Comprueba la ID.")
      ]
    });
  }
});

registerAdmin("mute", async (m, args) => {
  if (!adminOnly(m)) return;

  const target = mentionUser(m, args);

  if (!target) return m.reply("Usa `m!mute @usuario razón`.");

  const reason = reasonFrom(args);

  try {
    await target.timeout(2 * 60 * 60 * 1000, reason);

    await moderationLog(
      m,
      "MUTE",
      target.user.tag,
      reason
    );

    return m.reply({
      embeds: [
        successEmbed(
          `🔇 ${target.user.tag} fue silenciado durante **2 horas**.`
        )
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude silenciar al usuario.")
      ]
    });
  }
});

registerAdmin("unmute", async (m, args) => {
  if (!adminOnly(m)) return;

  const target = mentionUser(m, args);

  if (!target) return m.reply("Usa `m!unmute @usuario`.");

  try {
    await target.timeout(null, "Unmute manual");

    await moderationLog(
      m,
      "UNMUTE",
      target.user.tag,
      "Unmute manual"
    );

    return m.reply({
      embeds: [
        successEmbed(`🔊 ${target.user.tag} ya no está silenciado.`)
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude quitar el silencio.")
      ]
    });
  }
});

registerAdmin("warn", async (m, args) => {
  if (!adminOnly(m)) return;

  const target = mentionUser(m, args);

  if (!target) return m.reply("Usa `m!warn @usuario razón`.");

  const reason = reasonFrom(args);
  const g = guildData(m.guild.id);

  if (!g.warns[target.id]) {
    g.warns[target.id] = [];
  }

  g.warns[target.id].push({
    moderator: m.author.id,
    reason,
    at: Date.now()
  });

  saveDB();

  await moderationLog(
    m,
    "WARN",
    target.user.tag,
    reason
  );

  return m.reply({
    embeds: [
      successEmbed(`⚠️ ${target.user.tag} recibió un warn.`)
    ]
  });
});

registerAdmin("warnings", async (m, args) => {
  if (!adminOnly(m)) return;

  const target = mentionUser(m, args) || m.member;
  const warns = guildData(m.guild.id).warns[target.id] || [];

  const text = warns.length
    ? warns.map((w, i) =>
        `**${i + 1}.** ${w.reason} — <@${w.moderator}>`
      ).join("\n")
    : "Sin advertencias.";

  return m.reply({
    embeds: [
      embed(`⚠️ Warnings de ${target.user.username}`, text)
    ]
  });
});

registerAdmin("clear", async (m, args) => {
  if (!adminOnly(m)) return;

  const amount = Number(args[0]);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return m.reply("Usa `m!clear 1-100`.");
  }

  try {
    const messages = await m.channel.messages.fetch({
      limit: amount
    });

    const deleted = await m.channel.bulkDelete(messages, true);

    const logText = [...messages.values()]
      .slice(0, 20)
      .map(x =>
        `• **${x.author?.tag || "Desconocido"}:** ${truncate(x.content || "[sin texto]", 120)}`
      )
      .join("\n");

    await sendLog(
      m.guild,
      "🧹 CLEAR",
      `**Moderador:** ${m.author.tag}\n` +
      `**Canal:** ${m.channel}\n` +
      `**Mensajes eliminados:** ${deleted.size}\n\n` +
      `**Contenido registrado:**\n${logText || "No disponible."}`,
      0xFFB347
    );

    const confirmation = await m.channel.send({
      embeds: [
        successEmbed(`🧹 Eliminados **${deleted.size} mensajes**.`)
      ]
    });

    setTimeout(() => confirmation.delete().catch(() => {}), 3000);
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude eliminar los mensajes.")
      ]
    });
  }
});

registerAdmin("slowmode", async (m, args) => {
  if (!adminOnly(m)) return;

  const seconds = Number(args[0]);

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
    return m.reply("Usa un valor entre 0 y 21600 segundos.");
  }

  try {
    await m.channel.setRateLimitPerUser(seconds);

    await sendLog(
      m.guild,
      "🐌 SLOWMODE",
      `**Moderador:** ${m.author.tag}\n**Canal:** ${m.channel}\n**Nuevo valor:** ${seconds}s`
    );

    return m.reply({
      embeds: [
        successEmbed(`🐌 Slowmode establecido en **${seconds}s**.`)
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude cambiar el slowmode.")
      ]
    });
  }
});

registerAdmin("antilink", async (m, args) => {
  if (!adminOnly(m)) return;

  const value = args[0]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return m.reply("Usa `m!antilink on` o `m!antilink off`.");
  }

  guildData(m.guild.id).config.antiLink = value === "on";
  saveDB();

  await sendLog(
    m.guild,
    "🔗 ANTILINK",
    `**Moderador:** ${m.author.tag}\n**Estado:** ${value.toUpperCase()}`
  );

  return m.reply({
    embeds: [
      successEmbed(`🔗 Anti-link: **${value.toUpperCase()}**`)
    ]
  });
});

registerAdmin("antispam", async (m, args) => {
  if (!adminOnly(m)) return;

  const value = args[0]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return m.reply("Usa `m!antispam on` o `m!antispam off`.");
  }

  guildData(m.guild.id).config.antiSpam = value === "on";
  saveDB();

  await sendLog(
    m.guild,
    "🚨 ANTISPAM",
    `**Moderador:** ${m.author.tag}\n**Estado:** ${value.toUpperCase()}`
  );

  return m.reply({
    embeds: [
      successEmbed(`🚨 Anti-spam: **${value.toUpperCase()}**`)
    ]
  });
});

registerAdmin("log", async (m, args) => {
  if (!adminOnly(m)) return;

  if (args[0]?.toLowerCase() === "off") {
    guildData(m.guild.id).config.logChannel = null;
    saveDB();

    return m.reply({
      embeds: [
        successEmbed("📋 Sistema de logs desactivado.")
      ]
    });
  }

  const channel = m.mentions.channels.first();

  if (!channel || !channel.isTextBased()) {
    return m.reply("Usa `m!log #canal` o `m!log off`.");
  }

  guildData(m.guild.id).config.logChannel = channel.id;
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`📋 Logs configurados en ${channel}.`)
    ]
  });
});

registerAdmin("lock", async (m) => {
  if (!adminOnly(m)) return;

  if (!m.channel.isTextBased()) return;

  try {
    await m.channel.permissionOverwrites.edit(
      m.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    await sendLog(
      m.guild,
      "🔒 LOCK",
      `**Moderador:** ${m.author.tag}\n**Canal:** ${m.channel}`
    );

    return m.reply({
      embeds: [
        successEmbed("🔒 Canal bloqueado.")
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude bloquear el canal.")
      ]
    });
  }
});

registerAdmin("unlock", async (m) => {
  if (!adminOnly(m)) return;

  try {
    await m.channel.permissionOverwrites.edit(
      m.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    await sendLog(
      m.guild,
      "🔓 UNLOCK",
      `**Moderador:** ${m.author.tag}\n**Canal:** ${m.channel}`
    );

    return m.reply({
      embeds: [
        successEmbed("🔓 Canal desbloqueado.")
      ]
    });
  } catch {
    return m.reply({
      embeds: [
        errorEmbed("No pude desbloquear el canal.")
      ]
    });
  }
});

registerAdmin("welcome", async (m, args) => {
  if (!adminOnly(m)) return;

  const value = args[0]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return m.reply("Usa `m!welcome on` o `m!welcome off`.");
  }

  guildData(m.guild.id).config.welcome = value === "on";
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🌸 Bienvenida: **${value.toUpperCase()}**`)
    ]
  });
});

registerAdmin("welcomechannel", async (m) => {
  if (!adminOnly(m)) return;

  const channel = m.mentions.channels.first();

  if (!channel) {
    return m.reply("Usa `m!welcomechannel #canal`.");
  }

  guildData(m.guild.id).config.welcomeChannel = channel.id;
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🌸 Canal de bienvenida: ${channel}`)
    ]
  });
});

registerAdmin("welcomemessage", async (m, args) => {
  if (!adminOnly(m)) return;

  const text = args.join(" ");

  if (!text) {
    return m.reply(
      "Usa `m!welcomemessage Bienvenido {user} a {server}`."
    );
  }

  guildData(m.guild.id).config.welcomeMessage = text;
  saveDB();

  return m.reply({
    embeds: [
      successEmbed("🌸 Mensaje de bienvenida actualizado.")
    ]
  });
});

registerAdmin("autorole", async (m) => {
  if (!adminOnly(m)) return;

  const role = m.mentions.roles.first();

  if (!role) {
    return m.reply("Usa `m!autorole @rol`.");
  }

  guildData(m.guild.id).config.autoRole = role.id;
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`🎭 Auto-rol configurado: ${role}`)
    ]
  });
});

registerAdmin("setprefix", async (m, args) => {
  if (!adminOnly(m)) return;

  const newPrefix = args[0];

  if (!newPrefix || newPrefix.length > 5) {
    return m.reply("El prefix debe tener entre 1 y 5 caracteres.");
  }

  guildData(m.guild.id).config.prefix = newPrefix;
  saveDB();

  return m.reply({
    embeds: [
      successEmbed(`Prefix cambiado a **${newPrefix}**.`)
    ]
  });
});

registerAdmin("config", async (m) => {
  if (!adminOnly(m)) return;

  return commands.get("config").handler(m, []);
});

// ============================================================
// HELP
// ============================================================

function categoryEmoji(category) {
  return category.split(" ")[0];
}

async function showHelp(m) {
  const options = Object.keys(categories).map(category => ({
    label: category.replace(/^[^\s]+\s/, ""),
    value: category,
    emoji: categoryEmoji(category)
  }));

  const menu = new StringSelectMenuBuilder()
    .setCustomId("madokami_help")
    .setPlaceholder("🌸 Selecciona una categoría")
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(menu);

  return m.reply({
    embeds: [
      embed(
        "🌸 MADOKAMI — AYUDA",
        "Selecciona una categoría para ver sus comandos.\n\n" +
        "🔐 Los comandos administrativos están separados en `m!helpad`."
      )
    ],
    components: [row]
  });
}

async function showAdminHelp(m) {
  if (!isAdmin(m.member)) {
    return m.reply({
      embeds: [
        errorEmbed("🔒 Solo administradores pueden usar `m!helpad`.")
      ]
    });
  }

  const list = adminCommands
    .map((x, i) => `**${i + 1}.** \`${PREFIX}${x}\``)
    .join("\n");

  return m.reply({
    embeds: [
      embed(
        "🔐 MADOKAMI — ADMIN",
        list +
        "\n\n🛡️ Estos comandos requieren permisos de administrador."
      )
    ]
  });
}

// ============================================================
// EVENTOS
// ============================================================

client.once(Events.ClientReady, () => {
  console.log("==========================================");
  console.log("🌸 MADOKAMI CONECTADO");
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🌐 ${client.guilds.cache.size} servidores`);
  console.log(`📚 ${commands.size} comandos registrados`);
  console.log("==========================================");

  client.user.setPresence({
    activities: [
      {
        name: `m!help | ${client.guilds.cache.size} servidores`,
        type: 0
      }
    ],
    status: "online"
  });
});

// ============================================================
// BIENVENIDAS / AUTOROL
// ============================================================

client.on(Events.GuildMemberAdd, async member => {
  const g = guildData(member.guild.id);

  await sendLog(
    member.guild,
    "📥 MIEMBRO ENTRÓ",
    `**Usuario:** ${member.user.tag}\n**ID:** ${member.id}`,
    0x57F287
  );

  if (g.config.autoRole) {
    const role = member.guild.roles.cache.get(g.config.autoRole);

    if (role) {
      await member.roles.add(role).catch(() => {});
    }
  }

  if (g.config.welcome && g.config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      g.config.welcomeChannel
    );

    if (channel?.isTextBased()) {
      const text = g.config.welcomeMessage
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", member.guild.name);

      channel.send({
        embeds: [
          embed("🌸 Bienvenido/a", text)
        ]
      }).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberRemove, async member => {
  await sendLog(
    member.guild,
    "📤 MIEMBRO SALIÓ",
    `**Usuario:** ${member.user?.tag || "Desconocido"}\n**ID:** ${member.id}`,
    0xFF4D6D
  );
});

// ============================================================
// LOGS DE MENSAJES
// ============================================================

const messageCache = new Map();

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const key = message.id;

  messageCache.set(key, {
    author: message.author.tag,
    userId: message.author.id,
    channelId: message.channel.id,
    content: message.content,
    at: Date.now()
  });

  if (messageCache.size > 5000) {
    const first = messageCache.keys().next().value;
    messageCache.delete(first);
  }

  const g = guildData(message.guild.id);
  const u = userData(message.guild.id, message.author.id);

  g.messages++;
  u.messages++;

  if (!message.content.startsWith(PREFIX)) {
    addXP(message.guild.id, message.author.id, 5);
  }

  // ----------------------------------------------------------
  // ANTI-LINK
  // ----------------------------------------------------------

  if (
    g.config.antiLink &&
    !isAdmin(message.member) &&
    /https?:\/\/|www\./i.test(message.content)
  ) {
    try {
      await message.delete();

      await message.member.timeout(
        2 * 60 * 60 * 1000,
        "Anti-link"
      );

      await sendLog(
        message.guild,
        "🔗 ANTI-LINK",
        `**Usuario:** ${message.author.tag}\n` +
        `**Canal:** ${message.channel}\n` +
        `**Mensaje eliminado:** ${truncate(message.content)}\n` +
        `**Acción:** Timeout 2 horas`,
        0xFF4D6D
      );
    } catch (err) {
      console.error("Anti-link:", err);
    }

    return;
  }

  // ----------------------------------------------------------
  // ANTI-SPAM
  // ----------------------------------------------------------

  if (
    g.config.antiSpam &&
    !isAdmin(message.member)
  ) {
    const now = Date.now();

    if (!g._spam) g._spam = {};

    if (!g._spam[message.author.id]) {
      g._spam[message.author.id] = [];
    }

    g._spam[message.author.id] =
      g._spam[message.author.id].filter(
        t => now - t < 7000
      );

    g._spam[message.author.id].push(now);

    if (g._spam[message.author.id].length >= 6) {
      try {
        await message.delete();

        if (!g._spamWarn) g._spamWarn = {};

        if (!g._spamWarn[message.author.id] ||
            now - g._spamWarn[message.author.id] > 30000) {

          g._spamWarn[message.author.id] = now;

          if (!g.warns[message.author.id]) {
            g.warns[message.author.id] = [];
          }

          g.warns[message.author.id].push({
            moderator: client.user.id,
            reason: "Anti-spam",
            at: now
          });

          await sendLog(
            message.guild,
            "🚨 ANTI-SPAM",
            `**Usuario:** ${message.author.tag}\n` +
            `**Canal:** ${message.channel}\n` +
            `**Acción:** Mensaje eliminado + warn`,
            0xFF4D6D
          );
        }

        g._spam[message.author.id] = [];
        saveDB();
      } catch (err) {
        console.error("Anti-spam:", err);
      }

      return;
    }
  }

  // ----------------------------------------------------------
  // COMANDOS
  // ----------------------------------------------------------

  if (!message.content.startsWith(PREFIX)) return;

  const body = message.content.slice(PREFIX.length).trim();

  if (!body) return;

  const args = body.split(/\s+/);
  const commandName = args.shift().toLowerCase();

  if (commandName === "helpad") {
    return showAdminHelp(message);
  }

  const command = commands.get(commandName);

  if (!command) return;

  u.commands++;

  saveDB();

  try {
    await command.handler(message, args);
  } catch (err) {
    console.error(`Error en ${commandName}:`, err);

    await message.reply({
      embeds: [
        errorEmbed(
          "Ocurrió un error ejecutando ese comando."
        )
      ]
    }).catch(() => {});
  }
});

// ============================================================
// MENSAJES ELIMINADOS
// ============================================================

client.on(Events.MessageDelete, async message => {
  if (!message.guild) return;

  const cached = messageCache.get(message.id);

  await sendLog(
    message.guild,
    "🗑️ MENSAJE ELIMINADO",
    `**Usuario:** ${cached?.author || message.author?.tag || "Desconocido"}\n` +
    `**Canal:** ${message.channel}\n` +
    `**Contenido:** ${truncate(cached?.content || message.content || "No disponible")}`,
    0xFF4D6D
  );

  messageCache.delete(message.id);
});

// ============================================================
// MENSAJES EDITADOS
// ============================================================

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;

  if (
    oldMessage.content === newMessage.content
  ) return;

  await sendLog(
    newMessage.guild,
    "✏️ MENSAJE EDITADO",
    `**Usuario:** ${newMessage.author?.tag || "Desconocido"}\n` +
    `**Canal:** ${newMessage.channel}\n\n` +
    `**Antes:**\n${truncate(oldMessage.content || "No disponible", 1000)}\n\n` +
    `**Después:**\n${truncate(newMessage.content || "No disponible", 1000)}`,
    0xFEE75C
  );

  messageCache.set(newMessage.id, {
    author: newMessage.author?.tag,
    userId: newMessage.author?.id,
    channelId: newMessage.channel.id,
    content: newMessage.content,
    at: Date.now()
  });
});

// ============================================================
// ROLES
// ============================================================

client.on(Events.GuildRoleCreate, async role => {
  await sendLog(
    role.guild,
    "🎭 ROL CREADO",
    `**Rol:** ${role.name}\n**ID:** ${role.id}`,
    0x57F287
  );
});

client.on(Events.GuildRoleDelete, async role => {
  await sendLog(
    role.guild,
    "🗑️ ROL ELIMINADO",
    `**Rol:** ${role.name}\n**ID:** ${role.id}`,
    0xFF4D6D
  );
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  await sendLog(
    newRole.guild,
    "✏️ ROL MODIFICADO",
    `**Rol:** ${newRole.name}\n` +
    `**Nombre anterior:** ${oldRole.name}\n` +
    `**Color anterior:** ${oldRole.hexColor}\n` +
    `**Color nuevo:** ${newRole.hexColor}\n` +
    `**Posición anterior:** ${oldRole.position}\n` +
    `**Posición nueva:** ${newRole.position}`,
    0xFEE75C
  );
});

// ============================================================
// CANALES
// ============================================================

client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "📚 CANAL CREADO",
    `**Canal:** ${channel.name}\n**ID:** ${channel.id}`,
    0x57F287
  );
});

client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "🗑️ CANAL ELIMINADO",
    `**Canal:** ${channel.name}\n**ID:** ${channel.id}`,
    0xFF4D6D
  );
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  await sendLog(
    newChannel.guild,
    "✏️ CANAL MODIFICADO",
    `**Canal:** ${newChannel.name}\n` +
    `**Nombre anterior:** ${oldChannel.name}\n` +
    `**Nombre nuevo:** ${newChannel.name}`,
    0xFEE75C
  );
});

// ============================================================
// ERROR HANDLERS
// ============================================================

process.on("unhandledRejection", err => {
  console.error("Unhandled Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("Uncaught Exception:", err);
});

// ============================================================
// VALIDACIÓN DE COMANDOS
// ============================================================

function validateCommands() {
  console.log("\n========== VALIDACIÓN ==========");

  for (const [category, list] of Object.entries(categories)) {
    const missing = list.filter(name => !commands.has(name));

    console.log(
      `${category}: ${list.length} comandos`
    );

    if (missing.length) {
      console.error(
        `❌ FALTAN: ${missing.join(", ")}`
      );
    } else {
      console.log("✅ Todos registrados");
    }
  }

  console.log(`Total comandos públicos: ${Object.values(categories).flat().length}`);
  console.log(`Total comandos registrados: ${commands.size}`);
  console.log("================================\n");
}

validateCommands();

// ============================================================
// HTTP SERVER — RENDER
// ============================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end(
    `🌸 Madokami está funcionando.\n` +
    `Servidores: ${client.guilds.cache.size}\n` +
    `Comandos: ${commands.size}\n`
  );
});

server.listen(PORT, () => {
  console.log(`🌐 HTTP activo en puerto ${PORT}`);
});

// ============================================================
// LOGIN
// ============================================================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ FALTA DISCORD_TOKEN EN RENDER.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
