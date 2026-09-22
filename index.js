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
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
  Events,
  ChannelType
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

let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// ============================================================
// DATABASE
// ============================================================

let db = {};

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } else {
      db = {};
    }
  } catch (error) {
    console.error("Error cargando DB:", error);
    db = {};
  }
}

let saveTimer = null;

function saveDB() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (error) {
    console.error("Error guardando DB:", error);
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);

  saveTimer = setTimeout(() => {
    saveDB();
  }, 1000);
}

function defaultGuild() {
  return {
    config: {
      antiLink: false,
      antiSpam: false,
      logChannel: null,
      welcome: false,
      welcomeChannel: null,
      welcomeMessage: "🌸 Bienvenido/a {user} a {server}!",
      autoRole: null
    },

    users: {},
    warns: {}
  };
}

function getGuild(guildId) {
  if (!db[guildId]) {
    db[guildId] = defaultGuild();
    scheduleSave();
  }

  if (!db[guildId].config) {
    db[guildId].config = defaultGuild().config;
  }

  if (!db[guildId].users) db[guildId].users = {};
  if (!db[guildId].warns) db[guildId].warns = {};

  return db[guildId];
}

function defaultUser() {
  return {
    wallet: 0,
    bank: 0,
    xp: 0,
    messages: 0,
    commands: 0,
    bio: "",
    daily: 0,
    work: 0,
    salary: 0
  };
}

function getUser(guildId, userId) {
  const guild = getGuild(guildId);

  if (!guild.users[userId]) {
    guild.users[userId] = defaultUser();
    scheduleSave();
  }

  return guild.users[userId];
}

// ============================================================
// MEMORY
// ============================================================

const messageCache = new Map();
const spamTracker = new Map();
const xpCooldown = new Map();
const commandCooldowns = new Map();

function cacheMessage(message) {
  if (!message.guild) return;

  if (!messageCache.has(message.guild.id)) {
    messageCache.set(message.guild.id, new Map());
  }

  const cache = messageCache.get(message.guild.id);

  cache.set(message.id, {
    authorId: message.author?.id,
    authorTag: message.author?.tag,
    channelId: message.channel?.id,
    content: message.content || "",
    createdAt: Date.now()
  });

  if (cache.size > 500) {
    const first = cache.keys().next().value;
    cache.delete(first);
  }
}

// ============================================================
// HELPERS
// ============================================================

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(0xE8A7FF)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function errorEmbed(text) {
  return new EmbedBuilder()
    .setColor(0xFF3B3B)
    .setTitle("❌ Error")
    .setDescription(text)
    .setTimestamp();
}

function successEmbed(title, text) {
  return new EmbedBuilder()
    .setColor(0x9DFFB0)
    .setTitle(`🌸 ${title}`)
    .setDescription(text)
    .setTimestamp();
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatMoney(number) {
  return `${Number(number).toLocaleString("es-ES")} 💰`;
}

function getLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function xpForLevel(level) {
  return Math.pow(level - 1, 2) * 100;
}

function xpForNextLevel(level) {
  return Math.pow(level, 2) * 100;
}

function progressBar(current, total, size = 12) {
  if (total <= 0) return "████████████";

  const percent = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(percent * size);

  return "█".repeat(filled) + "░".repeat(size - filled);
}

function isAdmin(member) {
  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function mentionedUser(message) {
  return message.mentions.users.first();
}

function mentionedMember(message) {
  return message.mentions.members.first();
}

function stripMention(text) {
  return text.replace(/[<@!>]/g, "");
}

async function sendLong(message, text) {
  if (!text) return;

  const chunks = [];

  for (let i = 0; i < text.length; i += 1900) {
    chunks.push(text.slice(i, i + 1900));
  }

  for (const chunk of chunks) {
    await message.channel.send({
      content: chunk,
      allowedMentions: { parse: [] }
    });
  }
}

function containsLink(text) {
  return /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(text);
}

function parseDuration(input) {
  if (!input) return null;

  const match = /^(\d+)(s|m|h|d)$/i.exec(input);

  if (!match) return null;

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit === "s") return value * 1000;
  if (unit === "m") return value * 60 * 1000;
  if (unit === "h") return value * 60 * 60 * 1000;
  if (unit === "d") return value * 24 * 60 * 60 * 1000;

  return null;
}

function getCooldown(key, seconds) {
  const now = Date.now();
  const last = commandCooldowns.get(key) || 0;
  const remaining = seconds * 1000 - (now - last);

  if (remaining > 0) {
    return Math.ceil(remaining / 1000);
  }

  commandCooldowns.set(key, now);
  return 0;
}

// ============================================================
// LOGS
// ============================================================

async function sendLog(guild, title, description, color = 0xE8A7FF) {
  try {
    const data = getGuild(guild.id);
    const channelId = data.config.logChannel;

    if (!channelId) return;

    const channel = guild.channels.cache.get(channelId);

    if (!channel || !channel.isTextBased()) return;

    const logEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`📋 ${title}`)
      .setDescription(description.slice(0, 4000))
      .setTimestamp();

    await channel.send({
      embeds: [logEmbed]
    });
  } catch (error) {
    console.error("Error enviando log:", error);
  }
}

// ============================================================
// XP
// ============================================================

function addXP(guildId, userId, amount) {
  const user = getUser(guildId, userId);

  const oldLevel = getLevel(user.xp);

  user.xp += amount;

  const newLevel = getLevel(user.xp);

  scheduleSave();

  return {
    amount,
    oldLevel,
    newLevel,
    leveledUp: newLevel > oldLevel
  };
}

// ============================================================
// COMMAND REGISTRY
// ============================================================

const commands = new Map();

function command(names, handler) {
  for (const name of names) {
    commands.set(name.toLowerCase(), handler);
  }
}

// ============================================================
// PUBLIC CATEGORIES
// ============================================================

const PUBLIC_COMMANDS = {
  "💰 Economía": [
    "balance",
    "work",
    "daily",
    "pay",
    "give",
    "deposit",
    "withdraw",
    "bank",
    "money",
    "wallet",
    "cash",
    "coins",
    "wealth",
    "job",
    "salary",
    "income",
    "transactions",
    "financial",
    "economyinfo",
    "richest",
    "moneyleaderboard",
    "savings",
    "moneystats",
    "budget",
    "economy"
  ],

  "🎮 Diversión": [
    "8ball",
    "coinflip",
    "dice",
    "roll",
    "choose",
    "joke",
    "hug",
    "pat",
    "trivia",
    "guess",
    "random",
    "rate",
    "magic",
    "fortune",
    "hello",
    "fact",
    "quote",
    "compliment",
    "roast",
    "emoji",
    "color",
    "number",
    "reverse",
    "scramble",
    "riddle"
  ],

  "💬 Social": [
    "profile",
    "social",
    "say",
    "whois",
    "goodnight",
    "goodmorning",
    "highfive",
    "wave",
    "clap",
    "smile",
    "goodluck",
    "thanks",
    "support",
    "greet",
    "friend",
    "welcome",
    "activity",
    "messages",
    "socialstats",
    "joined",
    "account",
    "bio",
    "setbio",
    "clearbio",
    "userinfo"
  ],

  "⭐ Niveles": [
    "level",
    "xp",
    "rank",
    "levels",
    "nextlevel",
    "myrank",
    "topxp",
    "levelinfo",
    "progress",
    "xprequired",
    "xpneeded",
    "levelstats",
    "levelcheck",
    "mylevel",
    "myxp",
    "xprank",
    "toplevels",
    "progressbar",
    "levelcard",
    "xpstats",
    "rankinfo",
    "levelboard",
    "messagesxp",
    "xppermessage",
    "levelgoal"
  ],

  "ℹ️ Información": [
    "serverinfo",
    "avatar",
    "id",
    "roles",
    "channels",
    "members",
    "icon",
    "created",
    "owner",
    "boost",
    "rolescount",
    "channelcount",
    "botinfo",
    "membercount",
    "rolecount",
    "channelinfo",
    "serverid",
    "servericon",
    "serverowner",
    "memberinfo",
    "botstats",
    "guild",
    "information",
    "permissions"
  ],

  "🛠️ Utilidades": [
    "ping",
    "poll",
    "remind",
    "time",
    "timestamp",
    "invite",
    "sayembed",
    "uptime",
    "calc",
    "charcount",
    "wordcount",
    "uppercase",
    "lowercase",
    "repeat",
    "firstword",
    "lastword",
    "length",
    "serverstats",
    "roleinfo",
    "snowflake",
    "channelinfo",
    "permissions",
    "textinfo",
    "math",
    "utility"
  ],

  "🌸 Madokami": [
    "about",
    "prefix",
    "commands",
    "status",
    "server",
    "bot",
    "hello",
    "version",
    "statusbot",
    "uptimebot",
    "stats",
    "commandsinfo",
    "github",
    "developer",
    "support",
    "pingbot",
    "servers",
    "users",
    "channelsbot",
    "latency",
    "library",
    "node",
    "runtime",
    "memory",
    "config"
  ],

  "🤖 IA": [
    "ia",
    "ask",
    "imagen"
  ]
};

// ============================================================
// 💰 ECONOMÍA
// ============================================================

command(["balance", "money", "wallet", "cash", "coins"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);

  await message.reply({
    embeds: [
      embed(
        "💰 Tu economía",
        `**Billetera:** ${formatMoney(user.wallet)}\n` +
        `**Banco:** ${formatMoney(user.bank)}\n\n` +
        `💎 **Patrimonio:** ${formatMoney(user.wallet + user.bank)}`
      )
    ]
  });
});

command(["work", "job"], async (message) => {
  const key = `${message.guild.id}:${message.author.id}:work`;
  const remaining = getCooldown(key, 30);

  if (remaining) {
    return message.reply(`⏳ Espera **${remaining}s** para volver a trabajar.`);
  }

  const user = getUser(message.guild.id, message.author.id);
  const amount = random(100, 300);

  user.wallet += amount;
  scheduleSave();

  await message.reply({
    embeds: [
      successEmbed(
        "Trabajo completado",
        `Trabajaste y recibiste **${formatMoney(amount)}**.\n\n` +
        `💰 Ahora tienes ${formatMoney(user.wallet)}.`
      )
    ]
  });
});

command(["daily"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);
  const now = Date.now();

  if (now - user.daily < 24 * 60 * 60 * 1000) {
    const remaining = Math.ceil(
      (24 * 60 * 60 * 1000 - (now - user.daily)) / 3600000
    );

    return message.reply(`⏳ Tu recompensa diaria vuelve en aproximadamente **${remaining}h**.`);
  }

  const amount = random(1000, 2000);

  user.wallet += amount;
  user.daily = now;

  scheduleSave();

  await message.reply({
    embeds: [
      successEmbed(
        "Recompensa diaria",
        `Recibiste **${formatMoney(amount)}**.`
      )
    ]
  });
});

command(["pay", "give"], async (message) => {
  const target = mentionedUser(message);
  const amount = Number(message.args?.[1]);

  if (!target || !Number.isFinite(amount) || amount <= 0) {
    return message.reply("❌ Uso: `m!pay @usuario cantidad`");
  }

  if (target.bot) {
    return message.reply("❌ No puedes pagarle a un bot.");
  }

  const sender = getUser(message.guild.id, message.author.id);
  const receiver = getUser(message.guild.id, target.id);

  if (sender.wallet < amount) {
    return message.reply("❌ No tienes suficiente dinero.");
  }

  sender.wallet -= amount;
  receiver.wallet += amount;

  scheduleSave();

  await message.reply({
    embeds: [
      successEmbed(
        "Transferencia",
        `${message.author} envió **${formatMoney(amount)}** a ${target}.`
      )
    ]
  });
});

command(["deposit"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);
  const amount = Number(message.args?.[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return message.reply("❌ Uso: `m!deposit cantidad`");
  }

  if (user.wallet < amount) {
    return message.reply("❌ No tienes esa cantidad en la billetera.");
  }

  user.wallet -= amount;
  user.bank += amount;

  scheduleSave();

  await message.reply(`🏦 Depositaste **${formatMoney(amount)}**.`);
});

command(["withdraw"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);
  const amount = Number(message.args?.[1]);

  if (!Number.isFinite(amount) || amount <= 0) {
    return message.reply("❌ Uso: `m!withdraw cantidad`");
  }

  if (user.bank < amount) {
    return message.reply("❌ No tienes esa cantidad en el banco.");
  }

  user.bank -= amount;
  user.wallet += amount;

  scheduleSave();

  await message.reply(`🏦 Retiraste **${formatMoney(amount)}**.`);
});

command(["bank"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);

  await message.reply(
    `🏦 Tienes **${formatMoney(user.bank)}** guardados en el banco.`
  );
});

command(["salary", "income"], async (message) => {
  const key = `${message.guild.id}:${message.author.id}:salary`;
  const remaining = getCooldown(key, 1800);

  if (remaining) {
    return message.reply(`⏳ Tu próximo salario estará disponible en **${Math.ceil(remaining / 60)} minutos**.`);
  }

  const user = getUser(message.guild.id, message.author.id);
  const amount = random(500, 800);

  user.wallet += amount;
  user.salary = Date.now();

  scheduleSave();

  await message.reply(`💼 Recibiste un salario de **${formatMoney(amount)}**.`);
});

command(["wealth", "savings"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);

  await message.reply(
    `💎 Tu patrimonio total es **${formatMoney(user.wallet + user.bank)}**.`
  );
});

command(["transactions", "financial", "moneystats", "budget", "economy", "economyinfo"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);

  await message.reply({
    embeds: [
      embed(
        "💰 Estadísticas económicas",
        `💵 Billetera: ${formatMoney(user.wallet)}\n` +
        `🏦 Banco: ${formatMoney(user.bank)}\n` +
        `💎 Total: ${formatMoney(user.wallet + user.bank)}`
      )
    ]
  });
});

command(["richest", "moneyleaderboard"], async (message) => {
  const guild = getGuild(message.guild.id);

  const ranking = Object.entries(guild.users)
    .map(([id, user]) => ({
      id,
      total: (user.wallet || 0) + (user.bank || 0)
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  if (!ranking.length) {
    return message.reply("💰 Todavía no hay datos económicos.");
  }

  const lines = ranking.map(
    (x, i) =>
      `**${i + 1}.** <@${x.id}> — ${formatMoney(x.total)}`
  );

  await message.reply({
    embeds: [
      embed("🏆 Personas con más dinero", lines.join("\n"))
    ]
  });
});

// ============================================================
// 🎮 DIVERSIÓN
// ============================================================

command(["8ball"], async (message) => {
  const answers = [
    "Sí, definitivamente.",
    "No parece probable.",
    "Puede ser.",
    "Las estrellas dicen que sí.",
    "No estoy seguro.",
    "Pregunta nuevamente."
  ];

  await message.reply(`🔮 ${answers[random(0, answers.length - 1)]}`);
});

command(["coinflip"], async (message) => {
  await message.reply(
    `🪙 Cayó **${Math.random() < 0.5 ? "cara" : "cruz"}**.`
  );
});

command(["dice", "roll"], async (message) => {
  const sides = Math.min(
    Math.max(Number(message.args?.[1]) || 6, 2),
    100
  );

  await message.reply(`🎲 Resultado: **${random(1, sides)}** / ${sides}`);
});

command(["choose"], async (message) => {
  const options = message.args?.slice(1) || [];

  if (options.length < 2) {
    return message.reply("❌ Uso: `m!choose pizza hamburguesa`");
  }

  await message.reply(
    `🎯 Elijo: **${options[random(0, options.length - 1)]}**`
  );
});

command(["joke"], async (message) => {
  const jokes = [
    "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
    "¿Qué le dijo un byte a otro? Nos vemos en el siguiente ciclo.",
    "¿Por qué el ordenador fue al médico? Porque tenía un virus."
  ];

  await message.reply(`😂 ${jokes[random(0, jokes.length - 1)]}`);
});

command(["hug", "pat"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(
    `🌸 ${message.author} le manda un gesto amistoso a ${target}.`
  );
});

command(["trivia"], async (message) => {
  const questions = [
    ["¿Cuál es el planeta más grande del sistema solar?", "Júpiter"],
    ["¿Cuántos lados tiene un hexágono?", "6"],
    ["¿Cuál es la capital de Francia?", "París"],
    ["¿Qué gas respiramos principalmente del aire?", "Nitrógeno"]
  ];

  const q = questions[random(0, questions.length - 1)];

  await message.reply({
    embeds: [
      embed(
        "🧠 Trivia",
        `**Pregunta:** ${q[0]}\n\n💡 Respuesta: ||${q[1]}||`
      )
    ]
  });
});

command(["guess"], async (message) => {
  const guess = Number(message.args?.[1]);

  if (!Number.isInteger(guess) || guess < 1 || guess > 10) {
    return message.reply("❌ Adivina un número del **1 al 10**.");
  }

  const number = random(1, 10);

  await message.reply(
    guess === number
      ? `🎯 ¡Acertaste! Era **${number}**.`
      : `❌ No era. Salió **${number}**.`
  );
});

command(["random", "number"], async (message) => {
  await message.reply(`🎲 Número aleatorio: **${random(1, 100)}**`);
});

command(["rate"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(
    `⭐ La energía de ${target} hoy está en **${random(1, 100)}%**.`
  );
});

command(["magic", "fortune"], async (message) => {
  const answers = [
    "✨ Algo interesante podría ocurrir pronto.",
    "🌸 Hoy es un buen día para aprender algo nuevo.",
    "🔮 Tu próximo paso depende de tus decisiones.",
    "💫 Sigue avanzando."
  ];

  await message.reply(
    answers[random(0, answers.length - 1)]
  );
});

command(["hello"], async (message) => {
  await message.reply("🌸 ¡Hola! Soy **Madokami**.");
});

command(["fact"], async (message) => {
  const facts = [
    "🐙 Los pulpos tienen tres corazones.",
    "🌍 La Tierra gira sobre su eje aproximadamente cada 24 horas.",
    "🦋 Las mariposas prueban sabores mediante sensores en sus patas."
  ];

  await message.reply(`🧠 ${facts[random(0, facts.length - 1)]}`);
});

command(["quote"], async (message) => {
  const quotes = [
    "🌸 Cada pequeño paso cuenta.",
    "✨ Aprender también es avanzar.",
    "💫 La constancia puede cambiar muchas cosas."
  ];

  await message.reply(quotes[random(0, quotes.length - 1)]);
});

command(["compliment"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(
    `🌸 ${target} tiene una energía increíble.`
  );
});

command(["roast"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(
    `🔥 ${target}, Madokami dice que tu Wi-Fi necesita unas vacaciones 😂`
  );
});

command(["emoji"], async (message) => {
  const emojis = ["🌸", "✨", "💫", "🌙", "⭐", "🍀", "🎀"];

  await message.reply(
    emojis[random(0, emojis.length - 1)]
  );
});

command(["color"], async (message) => {
  const hex = Math.floor(Math.random() * 0xFFFFFF)
    .toString(16)
    .padStart(6, "0");

  await message.reply(`🎨 Color aleatorio: **#${hex.toUpperCase()}**`);
});

command(["reverse"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.reply(
    text.split("").reverse().join("")
  );
});

command(["scramble"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe una palabra.");

  const chars = text.split("");

  for (let i = chars.length - 1; i > 0; i--) {
    const j = random(0, i);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  await message.reply(chars.join(""));
});

command(["riddle"], async (message) => {
  await message.reply(
    "🧩 **Adivinanza:** Tengo agujas pero no sé coser. ¿Qué soy?\n\n||Un reloj.||"
  );
});

// ============================================================
// 💬 SOCIAL
// ============================================================

command(["profile"], async (message) => {
  const user = mentionedUser(message) || message.author;
  const data = getUser(message.guild.id, user.id);

  await message.reply({
    embeds: [
      embed(
        `🌸 Perfil de ${user.username}`,
        `💰 Dinero: ${formatMoney(data.wallet + data.bank)}\n` +
        `⭐ Nivel: ${getLevel(data.xp)}\n` +
        `✨ XP: ${data.xp}\n` +
        `💬 Mensajes: ${data.messages}\n\n` +
        `📝 Bio: ${data.bio || "Sin bio."}`
      )
    ]
  });
});

command(["social"], async (message) => {
  const data = getUser(message.guild.id, message.author.id);

  await message.reply(
    `💬 Tus estadísticas sociales:\n` +
    `Mensajes: **${data.messages}**\n` +
    `Comandos: **${data.commands}**`
  );
});

command(["say"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe algo.");

  await message.delete().catch(() => {});

  await message.channel.send({
    content: text,
    allowedMentions: { parse: [] }
  });
});

command(["whois", "userinfo"], async (message) => {
  const user = mentionedUser(message) || message.author;
  const member = await message.guild.members
    .fetch(user.id)
    .catch(() => null);

  await message.reply({
    embeds: [
      embed(
        `👤 Información de ${user.username}`,
        `🆔 ID: \`${user.id}\`\n` +
        `📅 Cuenta: <t:${Math.floor(user.createdTimestamp / 1000)}:F>\n` +
        `🤖 Bot: ${user.bot ? "Sí" : "No"}\n` +
        `📅 Entrada al servidor: ${
          member?.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>`
            : "No disponible"
        }`
      )
    ]
  });
});

command(["goodnight"], async (message) => {
  await message.reply("🌙 ¡Buenas noches! Que descanses.");
});

command(["goodmorning"], async (message) => {
  await message.reply("☀️ ¡Buenos días! Que tengas un excelente día.");
});

command(["highfive"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(`✋ ¡Choca esos cinco con ${target}!`);
});

command(["wave"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(`👋 ¡${message.author} saluda a ${target}!`);
});

command(["clap"], async (message) => {
  await message.reply("👏👏👏 ¡Aplausos!");
});

command(["smile"], async (message) => {
  await message.reply("😊 ¡Sonríe!");
});

command(["goodluck"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(`🍀 ¡Mucha suerte, ${target}!`);
});

command(["thanks"], async (message) => {
  await message.reply("🌸 ¡De nada!");
});

command(["support"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(`💗 ¡Mucho apoyo para ${target}!`);
});

command(["greet", "welcome"], async (message) => {
  const target = mentionedUser(message) || message.author;

  await message.reply(`🌸 ¡Bienvenido/a, ${target}!`);
});

command(["friend"], async (message) => {
  const target = mentionedUser(message);

  if (!target) {
    return message.reply("❌ Menciona a alguien.");
  }

  await message.reply(
    `🤝 ${message.author} y ${target} hacen buen equipo.`
  );
});

command(["activity", "messages", "socialstats"], async (message) => {
  const data = getUser(message.guild.id, message.author.id);

  await message.reply({
    embeds: [
      embed(
        "📊 Actividad",
        `💬 Mensajes: **${data.messages}**\n` +
        `⚙️ Comandos usados: **${data.commands}**\n` +
        `⭐ Nivel: **${getLevel(data.xp)}**`
      )
    ]
  });
});

command(["joined"], async (message) => {
  const member = message.member;

  await message.reply(
    member.joinedTimestamp
      ? `📅 Entraste al servidor el <t:${Math.floor(member.joinedTimestamp / 1000)}:F>.`
      : "❌ No pude obtener tu fecha de entrada."
  );
});

command(["account"], async (message) => {
  await message.reply(
    `📅 Tu cuenta fue creada el <t:${Math.floor(message.author.createdTimestamp / 1000)}:F>.`
  );
});

command(["bio"], async (message) => {
  const user = mentionedUser(message) || message.author;
  const data = getUser(message.guild.id, user.id);

  await message.reply(
    `📝 Bio de **${user.username}**:\n${data.bio || "Sin bio."}`
  );
});

command(["setbio"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) {
    return message.reply("❌ Uso: `m!setbio tu texto`");
  }

  if (text.length > 250) {
    return message.reply("❌ La bio puede tener máximo 250 caracteres.");
  }

  const user = getUser(message.guild.id, message.author.id);

  user.bio = text;
  scheduleSave();

  await message.reply("🌸 Tu bio fue actualizada.");
});

command(["clearbio"], async (message) => {
  const user = getUser(message.guild.id, message.author.id);

  user.bio = "";
  scheduleSave();

  await message.reply("🧹 Tu bio fue eliminada.");
});

// ============================================================
// ⭐ NIVELES
// ============================================================

command([
  "level",
  "xp",
  "levels",
  "myrank",
  "levelinfo",
  "progress",
  "xprequired",
  "xpneeded",
  "levelstats",
  "levelcheck",
  "mylevel",
  "myxp",
  "progressbar",
  "levelcard",
  "xpstats",
  "rankinfo",
  "levelboard",
  "messagesxp",
  "xppermessage",
  "levelgoal"
], async (message) => {
  const user = mentionedUser(message) || message.author;
  const data = getUser(message.guild.id, user.id);

  const level = getLevel(data.xp);
  const current = data.xp - xpForLevel(level);
  const required = xpForNextLevel(level) - xpForLevel(level);

  await message.reply({
    embeds: [
      embed(
        `⭐ Nivel de ${user.username}`,
        `**Nivel:** ${level}\n` +
        `**XP total:** ${data.xp}\n` +
        `**Progreso:** ${current}/${required}\n\n` +
        `${progressBar(current, required)}`
      )
    ]
  });
});

command(["rank", "xprank", "topxp", "toplevels"], async (message) => {
  const guild = getGuild(message.guild.id);

  const ranking = Object.entries(guild.users)
    .map(([id, user]) => ({
      id,
      xp: user.xp || 0
    }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  if (!ranking.length) {
    return message.reply("⭐ Todavía no hay ranking.");
  }

  await message.reply({
    embeds: [
      embed(
        "🏆 Ranking de XP",
        ranking
          .map(
            (x, i) =>
              `**${i + 1}.** <@${x.id}> — Nivel ${getLevel(x.xp)} (${x.xp} XP)`
          )
          .join("\n")
      )
    ]
  });
});

// ============================================================
// ℹ️ INFORMACIÓN
// ============================================================

command(["serverinfo", "server", "guild", "information"], async (message) => {
  const guild = message.guild;

  await message.reply({
    embeds: [
      embed(
        `🏠 ${guild.name}`,
        `🆔 ID: \`${guild.id}\`\n` +
        `👥 Miembros: **${guild.memberCount}**\n` +
        `💬 Canales: **${guild.channels.cache.size}**\n` +
        `🎭 Roles: **${guild.roles.cache.size}**\n` +
        `👑 Dueño: <@${guild.ownerId}>\n` +
        `📅 Creado: <t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
      )
    ]
  });
});

command(["avatar"], async (message) => {
  const user = mentionedUser(message) || message.author;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xE8A7FF)
        .setTitle(`🖼️ Avatar de ${user.username}`)
        .setImage(user.displayAvatarURL({ size: 1024 }))
    ]
  });
});

command(["id", "serverid"], async (message) => {
  await message.reply(`🆔 ID del servidor: \`${message.guild.id}\``);
});

command(["roles", "rolescount", "rolecount"], async (message) => {
  await message.reply(
    `🎭 Este servidor tiene **${message.guild.roles.cache.size} roles**.`
  );
});

command(["channels", "channelcount"], async (message) => {
  await message.reply(
    `📚 Este servidor tiene **${message.guild.channels.cache.size} canales**.`
  );
});

command(["members", "membercount"], async (message) => {
  await message.reply(
    `👥 Miembros del servidor: **${message.guild.memberCount}**.`
  );
});

command(["icon", "servericon"], async (message) => {
  const icon = message.guild.iconURL({ size: 1024 });

  if (!icon) {
    return message.reply("❌ Este servidor no tiene icono.");
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xE8A7FF)
        .setTitle(`🖼️ Icono de ${message.guild.name}`)
        .setImage(icon)
    ]
  });
});

command(["created"], async (message) => {
  await message.reply(
    `📅 El servidor fue creado el <t:${Math.floor(message.guild.createdTimestamp / 1000)}:F>.`
  );
});

command(["owner", "serverowner"], async (message) => {
  await message.reply(`👑 Dueño: <@${message.guild.ownerId}>`);
});

command(["boost"], async (message) => {
  await message.reply(
    `🚀 Nivel de boost: **${message.guild.premiumTier}**\n` +
    `💎 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`
  );
});

command(["botinfo", "botstats"], async (message) => {
  await message.reply({
    embeds: [
      embed(
        "🌸 Madokami",
        `🤖 Nombre: **${client.user.username}**\n` +
        `🆔 ID: \`${client.user.id}\`\n` +
        `📚 Servidores: **${client.guilds.cache.size}**\n` +
        `⚙️ Comandos: **${commands.size}**`
      )
    ]
  });
});

command(["channelinfo"], async (message) => {
  const channel =
    message.mentions.channels.first() || message.channel;

  await message.reply(
    `📚 **${channel.name}**\n` +
    `🆔 \`${channel.id}\`\n` +
    `📁 Tipo: **${channel.type}**`
  );
});

command(["memberinfo"], async (message) => {
  const member =
    mentionedMember(message) || message.member;

  await message.reply(
    `👤 **${member.user.username}**\n` +
    `🆔 \`${member.id}\`\n` +
    `🎭 Roles: **${Math.max(member.roles.cache.size - 1, 0)}**`
  );
});

command(["permissions"], async (message) => {
  const permissions = message.member.permissions.toArray();

  await sendLong(
    message,
    `🔐 Tus permisos:\n${permissions.map(p => `• ${p}`).join("\n")}`
  );
});

// ============================================================
// 🛠️ UTILIDADES
// ============================================================

command(["ping"], async (message) => {
  await message.reply(`🏓 Pong! **${client.ws.ping}ms**`);
});

command(["poll"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) {
    return message.reply("❌ Uso: `m!poll pregunta`");
  }

  const msg = await message.channel.send({
    embeds: [
      embed("📊 Encuesta", text)
    ]
  });

  await msg.react("👍").catch(() => {});
  await msg.react("👎").catch(() => {});
});

command(["remind"], async (message) => {
  const duration = parseDuration(message.args?.[1]);
  const text = message.args?.slice(2).join(" ");

  if (!duration || !text) {
    return message.reply(
      "❌ Uso: `m!remind 10m estudiar`"
    );
  }

  if (duration > 24 * 60 * 60 * 1000) {
    return message.reply("❌ El máximo es 24 horas.");
  }

  await message.reply("⏰ Recordatorio creado.");

  setTimeout(() => {
    message.author.send(`⏰ Recordatorio: ${text}`)
      .catch(() => {
        message.channel.send(
          `${message.author} ⏰ Recordatorio: ${text}`
        );
      });
  }, duration);
});

command(["time"], async (message) => {
  await message.reply(
    `🕐 Ahora mismo son **${new Date().toLocaleString("es-ES")}**.`
  );
});

command(["timestamp"], async (message) => {
  await message.reply(
    `<t:${Math.floor(Date.now() / 1000)}:F>`
  );
});

command(["invite"], async (message) => {
  const url = await client.generateInvite({
    scopes: ["bot", "applications.commands"],
    permissions: []
  });

  await message.reply(url);
});

command(["sayembed"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.channel.send({
    embeds: [
      embed("🌸 Madokami", text)
    ]
  });
});

command(["uptime"], async (message) => {
  const seconds = Math.floor(process.uptime());

  await message.reply(
    `⏱️ Uptime: **${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s**`
  );
});

command(["calc", "math"], async (message) => {
  const expression = message.args?.slice(1).join(" ");

  if (!expression) {
    return message.reply("❌ Uso: `m!calc 25*4+10`");
  }

  if (!/^[0-9+\-*/().%\s]+$/.test(expression)) {
    return message.reply("❌ Solo se permiten operaciones matemáticas básicas.");
  }

  try {
    const result = Function(`"use strict"; return (${expression})`)();

    if (!Number.isFinite(result)) {
      return message.reply("❌ Resultado inválido.");
    }

    await message.reply(`🧮 Resultado: **${result}**`);
  } catch {
    await message.reply("❌ No pude calcular esa operación.");
  }
});

command(["charcount", "length"], async (message) => {
  const text = message.args?.slice(1).join(" ") || "";

  await message.reply(`🔢 Caracteres: **${text.length}**`);
});

command(["wordcount"], async (message) => {
  const text = message.args?.slice(1).join(" ").trim();

  if (!text) return message.reply("🔢 Palabras: **0**");

  await message.reply(
    `🔢 Palabras: **${text.split(/\s+/).length}**`
  );
});

command(["uppercase"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.reply(text.toUpperCase());
});

command(["lowercase"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.reply(text.toLowerCase());
});

command(["repeat"], async (message) => {
  const amount = Math.min(
    Math.max(Number(message.args?.[1]) || 1, 1),
    5
  );

  const text = message.args?.slice(2).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.reply(
    Array(amount).fill(text).join("\n")
  );
});

command(["firstword"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  await message.reply(`🔤 Primera palabra: **${text.split(/\s+/)[0]}**`);
});

command(["lastword"], async (message) => {
  const text = message.args?.slice(1).join(" ");

  if (!text) return message.reply("❌ Escribe un texto.");

  const words = text.split(/\s+/);

  await message.reply(`🔤 Última palabra: **${words[words.length - 1]}**`);
});

command(["serverstats"], async (message) => {
  await message.reply(
    `📊 **Estadísticas**\n` +
    `👥 Miembros: ${message.guild.memberCount}\n` +
    `📚 Canales: ${message.guild.channels.cache.size}\n` +
    `🎭 Roles: ${message.guild.roles.cache.size}`
  );
});

command(["roleinfo"], async (message) => {
  const role = message.mentions.roles.first();

  if (!role) return message.reply("❌ Menciona un rol.");

  await message.reply(
    `🎭 **${role.name}**\n` +
    `🆔 \`${role.id}\`\n` +
    `👥 Miembros: **${role.members.size}**\n` +
    `📅 Creado: <t:${Math.floor(role.createdTimestamp / 1000)}:F>`
  );
});

command(["snowflake"], async (message) => {
  const id = message.args?.[1];

  if (!id || !/^\d+$/.test(id)) {
    return message.reply("❌ Introduce un ID de Discord válido.");
  }

  try {
    const timestamp =
      Number((BigInt(id) >> 22n)) + 1420070400000;

    await message.reply(
      `🆔 ID: \`${id}\`\n📅 Fecha aproximada: <t:${Math.floor(timestamp / 1000)}:F>`
    );
  } catch {
    await message.reply("❌ ID inválido.");
  }
});

command(["textinfo", "utility"], async (message) => {
  const text = message.args?.slice(1).join(" ") || "";

  await message.reply(
    `📝 Caracteres: **${text.length}**\n` +
    `🔤 Palabras: **${text ? text.split(/\s+/).length : 0}**`
  );
});

// ============================================================
// 🌸 MADOKAMI
// ============================================================

command(["about", "bot"], async (message) => {
  await message.reply({
    embeds: [
      embed(
        "🌸 MADOKAMI",
        "Bot multifunción para Discord.\n\n" +
        `⚙️ Prefijo: \`${PREFIX}\`\n` +
        `📚 Comandos: **${commands.size}**\n` +
        `🤖 IA: **Disponible si OPENAI_API_KEY está configurada**`
      )
    ]
  });
});

command(["prefix"], async (message) => {
  await message.reply(`🌸 El prefijo de Madokami es **${PREFIX}**`);
});

command(["commands", "commandsinfo"], async (message) => {
  await message.reply(
    `📚 Madokami tiene **${commands.size} comandos registrados**.\n` +
    `Usa \`${PREFIX}help\` para verlos.`
  );
});

command(["status", "statusbot"], async (message) => {
  await message.reply(
    `🟢 Madokami está funcionando.\n🏓 Ping: **${client.ws.ping}ms**`
  );
});

command(["version"], async (message) => {
  await message.reply("🌸 Madokami v1.0.0");
});

command(["uptimebot"], async (message) => {
  await message.reply(
    `⏱️ Madokami lleva **${Math.floor(process.uptime() / 60)} minutos** online.`
  );
});

command(["stats"], async (message) => {
  await message.reply(
    `📊 Servidores: **${client.guilds.cache.size}**\n` +
    `👥 Usuarios aproximados: **${client.guilds.cache.reduce((a, g) => a + g.memberCount, 0)}**\n` +
    `⚙️ Comandos: **${commands.size}**`
  );
});

command(["github"], async (message) => {
  await message.reply(
    "🐙 No hay un repositorio público configurado para Madokami."
  );
});

command(["developer"], async (message) => {
  await message.reply("👨‍💻 Proyecto: **Madokami**");
});

command(["support"], async (message) => {
  await message.reply(
    "💗 Para soporte, utiliza el servidor donde está instalado Madokami."
  );
});

command(["pingbot", "latency"], async (message) => {
  await message.reply(`🏓 Latencia: **${client.ws.ping}ms**`);
});

command(["servers"], async (message) => {
  await message.reply(
    `🌐 Madokami está en **${client.guilds.cache.size} servidores**.`
  );
});

command(["users"], async (message) => {
  const users = client.guilds.cache.reduce(
    (total, guild) => total + guild.memberCount,
    0
  );

  await message.reply(`👥 Usuarios aproximados: **${users}**`);
});

command(["channelsbot"], async (message) => {
  const channels = client.guilds.cache.reduce(
    (total, guild) => total + guild.channels.cache.size,
    0
  );

  await message.reply(`📚 Canales visibles: **${channels}**`);
});

command(["library"], async (message) => {
  await message.reply("📚 Biblioteca principal: **discord.js v14**.");
});

command(["node"], async (message) => {
  await message.reply(`🟢 Node.js: **${process.version}**`);
});

command(["runtime"], async (message) => {
  await message.reply(`⚙️ Runtime: **${process.platform} ${process.arch}**`);
});

command(["memory"], async (message) => {
  const memory = process.memoryUsage();

  await message.reply(
    `🧠 RAM usada: **${Math.round(memory.rss / 1024 / 1024)} MB**`
  );
});

command(["config"], async (message) => {
  const config = getGuild(message.guild.id).config;

  await message.reply({
    embeds: [
      embed(
        "⚙️ Configuración",
        `🔗 Anti-link: **${config.antiLink ? "ON" : "OFF"}**\n` +
        `🚫 Anti-spam: **${config.antiSpam ? "ON" : "OFF"}**\n` +
        `👋 Welcome: **${config.welcome ? "ON" : "OFF"}**\n` +
        `📋 Logs: **${config.logChannel ? `<#${config.logChannel}>` : "OFF"}**`
      )
    ]
  });
});

// ============================================================
// 🤖 IA
// ============================================================

async function askAI(prompt) {
  if (!openai) {
    throw new Error(
      "OPENAI_API_KEY no está disponible en el entorno."
    );
  }

  const response = await openai.responses.create({
    model: "gpt-5.6-luna",
    input: prompt
  });

  return response.output_text || "No recibí una respuesta de la IA.";
}

command(["ia"], async (message) => {
  const prompt = message.args?.slice(1).join(" ");

  if (!prompt) {
    return message.reply(
      "🤖 Uso: `m!ia tu pregunta`"
    );
  }

  const remaining = getCooldown(
    `${message.guild.id}:${message.author.id}:ia`,
    10
  );

  if (remaining) {
    return message.reply(
      `⏳ Espera ${remaining}s antes de usar IA otra vez.`
    );
  }

  if (!openai) {
    return message.reply(
      "❌ `OPENAI_API_KEY` no está disponible en Render."
    );
  }

  await message.channel.sendTyping();

  try {
    const answer = await askAI(prompt);

    await sendLong(
      message,
      `🤖 **Madokami IA**\n\n${answer}`
    );
  } catch (error) {
    console.error("OPENAI IA ERROR:", error);

    await message.reply(
      `❌ No pude contactar con la IA.\n` +
      `📋 Revisa los **Logs de Render** para ver el error exacto.`
    );
  }
});

command(["ask"], async (message) => {
  const prompt = message.args?.slice(1).join(" ");

  if (!prompt) {
    return message.reply(
      "🤖 Uso: `m!ask pregunta`"
    );
  }

  const remaining = getCooldown(
    `${message.guild.id}:${message.author.id}:ask`,
    10
  );

  if (remaining) {
    return message.reply(
      `⏳ Espera ${remaining}s.`
    );
  }

  if (!openai) {
    return message.reply(
      "❌ `OPENAI_API_KEY` no está disponible en Render."
    );
  }

  await message.channel.sendTyping();

  try {
    const answer = await askAI(
      `Responde de forma clara y directa a esta pregunta:\n${prompt}`
    );

    await sendLong(
      message,
      `🤖 **Respuesta**\n\n${answer}`
    );
  } catch (error) {
    console.error("OPENAI ASK ERROR:", error);

    await message.reply(
      "❌ No pude obtener una respuesta. Revisa los Logs de Render."
    );
  }
});

command(["imagen"], async (message) => {
  const prompt = message.args?.slice(1).join(" ");

  if (!prompt) {
    return message.reply(
      "🖼️ Uso: `m!imagen descripción`"
    );
  }

  const remaining = getCooldown(
    `${message.guild.id}:${message.author.id}:imagen`,
    30
  );

  if (remaining) {
    return message.reply(
      `⏳ Espera ${remaining}s antes de generar otra imagen.`
    );
  }

  if (!openai) {
    return message.reply(
      "❌ `OPENAI_API_KEY` no está disponible en Render."
    );
  }

  const loading = await message.reply(
    "🖼️ Generando tu imagen... espera un momento."
  );

  try {
    const result = await openai.images.generate({
      model: "gpt-image-2",
      prompt
    });

    const imageBase64 = result.data?.[0]?.b64_json;

    if (!imageBase64) {
      throw new Error("OpenAI no devolvió una imagen.");
    }

    const buffer = Buffer.from(imageBase64, "base64");

    const attachment = new AttachmentBuilder(buffer, {
      name: "madokami-image.png"
    });

    await loading.edit({
      content: "🌸 Imagen generada:",
      files: [attachment]
    });
  } catch (error) {
    console.error("OPENAI IMAGE ERROR:", error);

    await loading.edit({
      content:
        "❌ No pude generar la imagen.\n" +
        "📋 Revisa los Logs de Render para ver el error exacto."
    });
  }
});

// ============================================================
// 🔐 ADMIN CHECK
// ============================================================

async function requireAdmin(message) {
  if (!isAdmin(message.member)) {
    await message.reply(
      "🔒 Este comando es solo para administradores."
    );
    return false;
  }

  return true;
}

// ============================================================
// 🛡️ ADMIN — MODERACIÓN
// ============================================================

command(["ban"], async (message) => {
  if (!(await requireAdmin(message))) return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return message.reply("❌ No tienes permiso para banear.");
  }

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Uso: `m!ban @usuario razón`");
  }

  if (!member.bannable) {
    return message.reply("❌ No puedo banear a ese usuario.");
  }

  const reason =
    message.args?.slice(2).join(" ") || "Sin razón especificada";

  await member.ban({ reason });

  await message.reply(`🔨 ${member.user.tag} fue baneado.`);

  await sendLog(
    message.guild,
    "Usuario baneado",
    `👤 Usuario: ${member.user.tag}\n` +
    `🆔 ID: ${member.id}\n` +
    `👮 Moderador: ${message.author.tag}\n` +
    `📝 Razón: ${reason}`,
    0xFF4444
  );
});

command(["unban"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const id = message.args?.[1];

  if (!id) {
    return message.reply("❌ Uso: `m!unban ID`");
  }

  try {
    await message.guild.members.unban(id);

    await message.reply("🔓 Usuario desbaneado.");

    await sendLog(
      message.guild,
      "Usuario desbaneado",
      `🆔 ID: ${id}\n👮 Moderador: ${message.author.tag}`
    );
  } catch {
    await message.reply("❌ No pude quitar el ban.");
  }
});

command(["kick"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Uso: `m!kick @usuario razón`");
  }

  if (!member.kickable) {
    return message.reply("❌ No puedo expulsar a ese usuario.");
  }

  const reason =
    message.args?.slice(2).join(" ") || "Sin razón especificada";

  await member.kick(reason);

  await message.reply(`👢 ${member.user.tag} fue expulsado.`);

  await sendLog(
    message.guild,
    "Usuario expulsado",
    `👤 ${member.user.tag}\n👮 ${message.author.tag}\n📝 ${reason}`,
    0xFF8844
  );
});

command(["mute"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Uso: `m!mute @usuario`");
  }

  if (!member.moderatable) {
    return message.reply("❌ No puedo silenciar a ese usuario.");
  }

  await member.timeout(
    2 * 60 * 60 * 1000,
    `Mute por ${message.author.tag}`
  );

  await message.reply(
    `🔇 ${member.user.tag} fue silenciado durante **2 horas**.`
  );

  await sendLog(
    message.guild,
    "Usuario silenciado",
    `👤 ${member.user.tag}\n👮 ${message.author.tag}\n⏱️ 2 horas`,
    0xFFAA00
  );
});

command(["unmute"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Menciona al usuario.");
  }

  await member.timeout(null);

  await message.reply(`🔊 ${member.user.tag} ya no está silenciado.`);

  await sendLog(
    message.guild,
    "Mute eliminado",
    `👤 ${member.user.tag}\n👮 ${message.author.tag}`
  );
});

command(["warn"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Uso: `m!warn @usuario razón`");
  }

  const reason =
    message.args?.slice(2).join(" ") || "Sin razón especificada";

  const guild = getGuild(message.guild.id);

  if (!guild.warns[member.id]) {
    guild.warns[member.id] = [];
  }

  guild.warns[member.id].push({
    reason,
    moderator: message.author.id,
    date: Date.now()
  });

  scheduleSave();

  await message.reply(
    `⚠️ ${member.user.tag} recibió un warn.\n📝 ${reason}`
  );

  await sendLog(
    message.guild,
    "Warn aplicado",
    `👤 ${member.user.tag}\n` +
    `👮 ${message.author.tag}\n` +
    `📝 ${reason}`,
    0xFFAA00
  );
});

command(["warnings"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message) || message.member;
  const guild = getGuild(message.guild.id);
  const warns = guild.warns[member.id] || [];

  if (!warns.length) {
    return message.reply(
      `✅ ${member.user.tag} no tiene warns.`
    );
  }

  const text = warns.map(
    (w, i) =>
      `**${i + 1}.** ${w.reason}\n👮 <@${w.moderator}> • <t:${Math.floor(w.date / 1000)}:R>`
  ).join("\n\n");

  await message.reply({
    embeds: [
      embed(
        `⚠️ Warns de ${member.user.username}`,
        text
      )
    ]
  });
});

command(["resetwarnings"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const member = mentionedMember(message);

  if (!member) {
    return message.reply("❌ Menciona un usuario.");
  }

  const guild = getGuild(message.guild.id);

  guild.warns[member.id] = [];

  scheduleSave();

  await message.reply("🧹 Warns eliminados.");
});

command(["clear"], async (message) => {
  if (!(await requireAdmin(message))) return;

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return message.reply("❌ No tienes permiso para borrar mensajes.");
  }

  const amount = Number(message.args?.[1]);

  if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
    return message.reply("❌ Usa una cantidad entre 1 y 100.");
  }

  const fetched = await message.channel.messages.fetch({
    limit: amount
  });

  const details = fetched
    .filter(m => !m.author.bot)
    .map(
      m =>
        `👤 ${m.author.tag}: ${m.content || "[sin texto]"}`
    )
    .join("\n");

  const deleted = await message.channel.bulkDelete(
    fetched,
    true
  );

  await message.channel.send(
    `🧹 Eliminados **${deleted.size} mensajes**.`
  ).then(msg => {
    setTimeout(() => msg.delete().catch(() => {}), 3000);
  });

  await sendLog(
    message.guild,
    "Mensajes eliminados",
    `👮 Moderador: ${message.author.tag}\n` +
    `📚 Cantidad: ${deleted.size}\n\n` +
    (details || "Sin contenido disponible."),
    0xFF8844
  );
});

command(["slowmode"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const seconds = Number(message.args?.[1]);

  if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
    return message.reply("❌ Usa entre 0 y 21600 segundos.");
  }

  await message.channel.setRateLimitPerUser(seconds);

  await message.reply(
    `🐌 Slowmode establecido en **${seconds}s**.`
  );

  await sendLog(
    message.guild,
    "Slowmode cambiado",
    `📚 Canal: ${message.channel}\n` +
    `⏱️ ${seconds}s\n` +
    `👮 ${message.author.tag}`
  );
});

command(["lock"], async (message) => {
  if (!(await requireAdmin(message))) return;

  await message.channel.permissionOverwrites.edit(
    message.guild.roles.everyone,
    {
      SendMessages: false
    }
  );

  await message.reply("🔒 Canal bloqueado.");

  await sendLog(
    message.guild,
    "Canal bloqueado",
    `📚 ${message.channel}\n👮 ${message.author.tag}`
  );
});

command(["unlock"], async (message) => {
  if (!(await requireAdmin(message))) return;

  await message.channel.permissionOverwrites.edit(
    message.guild.roles.everyone,
    {
      SendMessages: null
    }
  );

  await message.reply("🔓 Canal desbloqueado.");

  await sendLog(
    message.guild,
    "Canal desbloqueado",
    `📚 ${message.channel}\n👮 ${message.author.tag}`
  );
});

// ============================================================
// 🔗 ANTI LINK
// ============================================================

command(["antilink"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const value = message.args?.[1]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return message.reply("❌ Usa `m!antilink on` o `m!antilink off`.");
  }

  const guild = getGuild(message.guild.id);

  guild.config.antiLink = value === "on";

  scheduleSave();

  await message.reply(
    `🔗 Anti-link: **${guild.config.antiLink ? "ACTIVADO" : "DESACTIVADO"}**`
  );

  await sendLog(
    message.guild,
    "Anti-link cambiado",
    `Estado: ${guild.config.antiLink ? "ON" : "OFF"}\n👮 ${message.author.tag}`
  );
});

command(["antispam"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const value = message.args?.[1]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return message.reply("❌ Usa `m!antispam on` o `m!antispam off`.");
  }

  const guild = getGuild(message.guild.id);

  guild.config.antiSpam = value === "on";

  scheduleSave();

  await message.reply(
    `🚫 Anti-spam: **${guild.config.antiSpam ? "ACTIVADO" : "DESACTIVADO"}**`
  );
});

// ============================================================
// 📝 LOG
// ============================================================

command(["log"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const arg = message.args?.[1];

  const guild = getGuild(message.guild.id);

  if (!arg) {
    return message.reply(
      "❌ Usa `m!log #canal` o `m!log off`."
    );
  }

  if (arg.toLowerCase() === "off") {
    guild.config.logChannel = null;
    scheduleSave();

    return message.reply("📋 Logs desactivados.");
  }

  const channel = message.mentions.channels.first();

  if (!channel) {
    return message.reply("❌ Menciona un canal.");
  }

  guild.config.logChannel = channel.id;

  scheduleSave();

  await message.reply(
    `📋 Logs configurados en ${channel}.`
  );

  await sendLog(
    message.guild,
    "Sistema de logs activado",
    `👮 ${message.author.tag}`
  );
});

// ============================================================
// 👋 WELCOME
// ============================================================

command(["welcome"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const value = message.args?.[1]?.toLowerCase();

  if (!["on", "off"].includes(value)) {
    return message.reply("❌ Usa `m!welcome on` o `m!welcome off`.");
  }

  const guild = getGuild(message.guild.id);

  guild.config.welcome = value === "on";

  scheduleSave();

  await message.reply(
    `👋 Bienvenida: **${guild.config.welcome ? "ACTIVADA" : "DESACTIVADA"}**`
  );
});

command(["welcomechannel"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const channel = message.mentions.channels.first();

  if (!channel) {
    return message.reply("❌ Menciona un canal.");
  }

  const guild = getGuild(message.guild.id);

  guild.config.welcomeChannel = channel.id;

  scheduleSave();

  await message.reply(
    `👋 Canal de bienvenida: ${channel}`
  );
});

command(["welcomemessage"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const text = message.args?.slice(1).join(" ");

  if (!text) {
    return message.reply(
      "❌ Uso: `m!welcomemessage Bienvenido {user} a {server}`"
    );
  }

  const guild = getGuild(message.guild.id);

  guild.config.welcomeMessage = text;

  scheduleSave();

  await message.reply("👋 Mensaje de bienvenida actualizado.");
});

command(["autorole"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const role = message.mentions.roles.first();

  if (!role) {
    return message.reply("❌ Menciona un rol.");
  }

  const guild = getGuild(message.guild.id);

  guild.config.autoRole = role.id;

  scheduleSave();

  await message.reply(
    `🎭 Autorole configurado: ${role}`
  );
});

// ============================================================
// 🛡️ ADMIN HELP
// ============================================================

const ADMIN_COMMANDS = [
  "ban",
  "unban",
  "kick",
  "mute",
  "unmute",
  "warn",
  "warnings",
  "resetwarnings",
  "clear",
  "slowmode",
  "lock",
  "unlock",
  "antilink",
  "antispam",
  "log",
  "welcome",
  "welcomechannel",
  "welcomemessage",
  "autorole"
];

command(["helpad"], async (message) => {
  if (!(await requireAdmin(message))) return;

  const lines = ADMIN_COMMANDS.map(
    (cmd, i) => `**${i + 1}.** \`${PREFIX}${cmd}\``
  );

  await message.reply({
    embeds: [
      embed(
        "🔐 MADOKAMI — ADMIN",
        "Comandos exclusivos para administradores.\n\n" +
        lines.join("\n")
      )
    ]
  });
});

// ============================================================
// 🌸 HELP MENU
// ============================================================

function createHelpMenu() {
  const options = Object.keys(PUBLIC_COMMANDS).map(
    category => ({
      label: category.replace(/^.\s/, ""),
      value: category,
      description: `${PUBLIC_COMMANDS[category].length} comandos`
    })
  );

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_help")
      .setPlaceholder("🌸 Selecciona una categoría")
      .addOptions(options)
  );
}

command(["help"], async (message) => {
  const helpEmbed = new EmbedBuilder()
    .setColor(0xE8A7FF)
    .setTitle("🌸 MADOKAMI — AYUDA")
    .setDescription(
      "Selecciona una categoría para ver sus comandos.\n\n" +
      "🔐 Los comandos administrativos están separados en `m!helpad`."
    )
    .setTimestamp();

  await message.reply({
    embeds: [helpEmbed],
    components: [createHelpMenu()]
  });
});

// ============================================================
// HELP INTERACTION — FIX DEL TIMEOUT
// ============================================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId !== "madokami_help") return;

    try {
      await interaction.deferReply({
        ephemeral: true
      });

      const category = interaction.values[0];
      const list = PUBLIC_COMMANDS[category];

      if (!list) {
        return interaction.editReply({
          embeds: [
            errorEmbed("Categoría no encontrada.")
          ]
        });
      }

      const lines = list.map(
        (cmd, index) =>
          `**${index + 1}.** \`${PREFIX}${cmd}\``
      );

      const categoryEmbed = new EmbedBuilder()
        .setColor(0xE8A7FF)
        .setTitle(`🌸 ${category}`)
        .setDescription(lines.join("\n"))
        .setFooter({
          text: `Madokami • ${list.length} comandos`
        })
        .setTimestamp();

      await interaction.editReply({
        embeds: [categoryEmbed],
        components: [createHelpMenu()]
      });

    } catch (error) {
      console.error("HELP INTERACTION ERROR:", error);

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [
            errorEmbed(
              "No pude cargar esta categoría."
            )
          ]
        }).catch(() => {});
      }
    }
  }
);

// ============================================================
// EVENTS
// ============================================================

client.once(Events.ClientReady, () => {
  console.log("========================================");
  console.log("🌸 MADOKAMI CONECTADO");
  console.log(`🤖 ${client.user.tag}`);
  console.log(`📚 ${commands.size} comandos`);
  console.log("========================================");

  client.user.setActivity("m!help", {
    type: 0
  });
});

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(Events.MessageCreate, async message => {
  if (!message.guild) return;
  if (message.author.bot) return;

  cacheMessage(message);

  const guild = getGuild(message.guild.id);
  const user = getUser(message.guild.id, message.author.id);

  user.messages++;

  // XP
  const xpKey = `${message.guild.id}:${message.author.id}`;

  if (
    !xpCooldown.has(xpKey) ||
    Date.now() - xpCooldown.get(xpKey) >= 10000
  ) {
    xpCooldown.set(xpKey, Date.now());

    const result = addXP(
      message.guild.id,
      message.author.id,
      random(5, 12)
    );

    if (result.leveledUp) {
      message.channel.send(
        `🎉 ${message.author} subió al **nivel ${result.newLevel}**!`
      ).catch(() => {});
    }
  }

  // Anti-link
  if (
    guild.config.antiLink &&
    !isAdmin(message.member) &&
    containsLink(message.content)
  ) {
    await message.delete().catch(() => {});

    await message.member
      .timeout(
        2 * 60 * 60 * 1000,
        "Anti-link Madokami"
      )
      .catch(() => {});

    await message.channel.send(
      `🔗 ${message.author}, los enlaces no están permitidos aquí.`
    ).then(msg => {
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    }).catch(() => {});

    await sendLog(
      message.guild,
      "Anti-link",
      `👤 ${message.author.tag}\n` +
      `📚 ${message.channel}\n` +
      `📝 ${message.content || "[sin contenido]"}\n` +
      `⏱️ Timeout: 2 horas`,
      0xFF4444
    );

    return;
  }

  // Anti-spam
  if (
    guild.config.antiSpam &&
    !isAdmin(message.member)
  ) {
    const key = `${message.guild.id}:${message.author.id}`;

    if (!spamTracker.has(key)) {
      spamTracker.set(key, []);
    }

    const times = spamTracker.get(key);

    times.push(Date.now());

    while (
      times.length &&
      Date.now() - times[0] > 7000
    ) {
      times.shift();
    }

    if (times.length >= 6) {
      times.length = 0;

      await message.delete().catch(() => {});

      if (!guild.warns[message.author.id]) {
        guild.warns[message.author.id] = [];
      }

      guild.warns[message.author.id].push({
        reason: "Anti-spam automático",
        moderator: client.user.id,
        date: Date.now()
      });

      scheduleSave();

      await message.channel.send(
        `🚫 ${message.author}, reduce el spam. Se eliminó tu mensaje.`
      ).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 4000);
      }).catch(() => {});

      await sendLog(
        message.guild,
        "Anti-spam",
        `👤 ${message.author.tag}\n` +
        `📚 ${message.channel}\n` +
        `⚠️ Warn automático`,
        0xFFAA00
      );

      return;
    }
  }

  // Comando
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content.trim().split(/\s+/);
  const commandName = args.shift().slice(PREFIX.length).toLowerCase();

  message.args = [
    commandName,
    ...args
  ];

  const handler = commands.get(commandName);

  if (!handler) return;

  user.commands++;
  scheduleSave();

  try {
    await handler(message);
  } catch (error) {
    console.error(
      `ERROR EN ${PREFIX}${commandName}:`,
      error
    );

    await message.reply({
      embeds: [
        errorEmbed(
          "Ocurrió un error ejecutando este comando.\n\n" +
          "Revisa los Logs de Render para ver el error."
        )
      ]
    }).catch(() => {});
  }
});

// ============================================================
// MESSAGE DELETE LOG
// ============================================================

client.on(Events.MessageDelete, async message => {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const cached =
    messageCache.get(message.guild.id)?.get(message.id);

  const author =
    message.author?.tag ||
    cached?.authorTag ||
    "Usuario desconocido";

  const content =
    message.content ||
    cached?.content ||
    "Contenido no disponible";

  await sendLog(
    message.guild,
    "Mensaje eliminado",
    `👤 Usuario: ${author}\n` +
    `📚 Canal: <#${message.channelId || cached?.channelId}>\n` +
    `📝 Contenido:\n${content}`,
    0xFF4444
  );
});

// ============================================================
// MESSAGE UPDATE LOG
// ============================================================

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    newMessage.guild,
    "Mensaje editado",
    `👤 Usuario: ${newMessage.author?.tag || "Desconocido"}\n` +
    `📚 Canal: <#${newMessage.channelId}>\n\n` +
    `🔴 Antes:\n${oldMessage.content || "No disponible"}\n\n` +
    `🟢 Después:\n${newMessage.content || "No disponible"}`,
    0xFFAA00
  );
});

// ============================================================
// MEMBER EVENTS
// ============================================================

client.on(Events.GuildMemberAdd, async member => {
  const guild = getGuild(member.guild.id);
  const config = guild.config;

  await sendLog(
    member.guild,
    "Miembro entró",
    `👤 ${member.user.tag}\n🆔 ${member.id}`,
    0x9DFFB0
  );

  if (config.welcome && config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      config.welcomeChannel
    );

    if (channel?.isTextBased()) {
      const text = config.welcomeMessage
        .replaceAll("{user}", `<@${member.id}>`)
        .replaceAll("{server}", member.guild.name);

      await channel.send({
        content: text,
        allowedMentions: {
          users: [member.id]
        }
      }).catch(() => {});
    }
  }

  if (config.autoRole) {
    const role = member.guild.roles.cache.get(
      config.autoRole
    );

    if (role) {
      await member.roles.add(role).catch(() => {});
    }
  }
});

client.on(Events.GuildMemberRemove, async member => {
  await sendLog(
    member.guild,
    "Miembro salió",
    `👤 ${member.user?.tag || "Desconocido"}\n🆔 ${member.id}`,
    0xFF8844
  );
});

// ============================================================
// ROLE EVENTS
// ============================================================

client.on(Events.GuildRoleCreate, async role => {
  await sendLog(
    role.guild,
    "Rol creado",
    `🎭 Rol: ${role}\n🆔 ${role.id}`,
    0x9DFFB0
  );
});

client.on(Events.GuildRoleDelete, async role => {
  await sendLog(
    role.guild,
    "Rol eliminado",
    `🎭 Rol: **${role.name}**\n🆔 ${role.id}`,
    0xFF4444
  );
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const changes = [];

  if (oldRole.name !== newRole.name) {
    changes.push(
      `🏷️ Nombre: **${oldRole.name}** → **${newRole.name}**`
    );
  }

  if (oldRole.hexColor !== newRole.hexColor) {
    changes.push(
      `🎨 Color: **${oldRole.hexColor}** → **${newRole.hexColor}**`
    );
  }

  if (!changes.length) return;

  await sendLog(
    newRole.guild,
    "Rol modificado",
    `🎭 Rol: ${newRole}\n${changes.join("\n")}`,
    0xFFAA00
  );
});

// ============================================================
// CHANNEL EVENTS
// ============================================================

client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "Canal creado",
    `📚 Canal: ${channel}\n🆔 ${channel.id}`,
    0x9DFFB0
  );
});

client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "Canal eliminado",
    `📚 Canal: **${channel.name}**\n🆔 ${channel.id}`,
    0xFF4444
  );
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  const changes = [];

  if (oldChannel.name !== newChannel.name) {
    changes.push(
      `🏷️ Nombre: **${oldChannel.name}** → **${newChannel.name}**`
    );
  }

  if (changes.length) {
    await sendLog(
      newChannel.guild,
      "Canal modificado",
      `📚 Canal: ${newChannel}\n${changes.join("\n")}`,
      0xFFAA00
    );
  }
});

// ============================================================
// BAN EVENTS
// ============================================================

client.on(Events.GuildBanAdd, async ban => {
  await sendLog(
    ban.guild,
    "Ban detectado",
    `👤 Usuario: ${ban.user.tag}\n🆔 ${ban.user.id}`,
    0xFF4444
  );
});

client.on(Events.GuildBanRemove, async ban => {
  await sendLog(
    ban.guild,
    "Ban eliminado",
    `👤 Usuario: ${ban.user.tag}\n🆔 ${ban.user.id}`,
    0x9DFFB0
  );
});

// ============================================================
// VALIDACIÓN DE COMANDOS
// ============================================================

for (const [category, list] of Object.entries(PUBLIC_COMMANDS)) {
  const missing = list.filter(
    name => !commands.has(name)
  );

  if (missing.length) {
    console.error(
      `❌ COMANDOS FALTANTES EN ${category}:`,
      missing
    );
  }
}

// ============================================================
// RENDER HTTP SERVER
// ============================================================

const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8"
  });

  res.end("🌸 Madokami está online.");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 HTTP activo en puerto ${PORT}`);
});

// ============================================================
// START
// ============================================================

loadDB();

process.on("SIGTERM", () => {
  saveDB();

  if (client) {
    client.destroy();
  }

  process.exit(0);
});

process.on("SIGINT", () => {
  saveDB();

  if (client) {
    client.destroy();
  }

  process.exit(0);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ FALTA DISCORD_TOKEN EN RENDER.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN).catch(error => {
  console.error("❌ ERROR CONECTANDO DISCORD:", error);
  process.exit(1);
});
