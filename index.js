// ============================================================
// 🌸 MADOKAMI
// Discord.js v14
// Prefix: m!
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
  Events,
  ChannelType
} = require("discord.js");

const { GoogleGenAI } = require("@google/genai");
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
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
  ]
});

// ============================================================
// GEMINI
// ============================================================

const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

// ============================================================
// DATABASE
// ============================================================

let db = {};

function saveDB() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.error("Error guardando DB:", err);
  }
}

function loadDB() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
      );
    }
  } catch (err) {
    console.error("Error cargando DB:", err);
    db = {};
  }
}

function guildData(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      config: {
        logChannel: null,
        antiLink: false,
        antiSpam: false,
        whitelist: [],
        autoResponses: {},
        autoReactions: {},
        welcome: false,
        welcomeChannel: null,
        welcomeMessage: "🌸 Bienvenido/a {user} a {server}!"
      },
      users: {},
      warnings: {}
    };
  }

  return db[guildId];
}

function userData(guildId, userId) {
  const guild = guildData(guildId);

  if (!guild.users[userId]) {
    guild.users[userId] = {
      wallet: 0,
      bank: 0,
      xp: 0,
      level: 1,
      inventory: [],
      stats: {
        earned: 0,
        spent: 0,
        commands: 0,
        messages: 0
      },
      cooldowns: {}
    };
  }

  return guild.users[userId];
}

// ============================================================
// UTILIDADES
// ============================================================

function money(number) {
  return `${Number(number || 0).toLocaleString("es-ES")} 💰`;
}

function random(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function admin(member) {
  return member.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function whitelisted(guildId, userId) {
  return guildData(guildId).config.whitelist.includes(
    userId
  );
}

function cd(user, command, seconds) {
  const now = Date.now();
  const last = user.cooldowns[command] || 0;

  if (now - last < seconds * 1000) {
    return Math.ceil(
      (seconds * 1000 - (now - last)) / 1000
    );
  }

  user.cooldowns[command] = now;
  return 0;
}

function addMoney(user, amount) {
  user.wallet += amount;

  if (amount > 0) {
    user.stats.earned += amount;
  } else {
    user.stats.spent += Math.abs(amount);
  }
}

function addXP(user, amount) {
  user.xp += amount;

  let levelUp = false;

  while (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level++;
    levelUp = true;
  }

  return levelUp;
}

function embed(title, description, color = 0x9b59b6) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({
      text: "Madokami • m!help"
    })
    .setTimestamp();
}

async function longReply(message, text) {
  if (text.length <= 1900) {
    return message.reply(text);
  }

  for (let i = 0; i < text.length; i += 1900) {
    await message.channel.send(
      text.slice(i, i + 1900)
    );
  }
}

async function log(guild, title, description) {
  const channelId =
    guildData(guild.id).config.logChannel;

  if (!channelId) return;

  const channel =
    guild.channels.cache.get(channelId);

  if (!channel) return;

  try {
    await channel.send({
      embeds: [
        embed(
          title,
          description,
          0x5865f2
        )
      ]
    });
  } catch {}
}

// ============================================================
// GEMINI
// ============================================================

async function askAI(prompt) {
  if (!gemini) {
    throw new Error(
      "GEMINI_API_KEY no configurada."
    );
  }

  const response =
    await gemini.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt
    });

  return response.text ||
    "No recibí una respuesta.";
}

async function makeImage(prompt) {
  if (!gemini) {
    throw new Error(
      "GEMINI_API_KEY no configurada."
    );
  }

  const response =
    await gemini.models.generateContent({
      model: "gemini-3.1-flash-image",
      contents: prompt,
      config: {
        responseModalities: ["IMAGE"]
      }
    });

  const parts =
    response.candidates?.[0]?.content?.parts || [];

  for (const part of parts) {
    if (
      part.inlineData &&
      part.inlineData.data
    ) {
      return Buffer.from(
        part.inlineData.data,
        "base64"
      );
    }
  }

  throw new Error(
    "Gemini no devolvió una imagen."
  );
}

// ============================================================
// LISTAS DE COMANDOS
// EXACTAMENTE 30 POR MENÚ
// ============================================================

const ECONOMIA = [
  ["balance", "💰 Ver tu dinero"],
  ["work", "💼 Trabajar"],
  ["daily", "🎁 Recompensa diaria"],
  ["weekly", "📅 Recompensa semanal"],
  ["bonus", "🎁 Bonus"],
  ["salary", "💼 Cobrar salario"],
  ["quest", "📜 Completar misión"],
  ["fish", "🎣 Pescar"],
  ["mine", "⛏️ Minar"],
  ["farm", "🌾 Trabajar en la granja"],
  ["hunt", "🏹 Buscar recursos"],
  ["collect", "🧺 Recolectar"],
  ["delivery", "🚚 Hacer entregas"],
  ["treasure", "🗺️ Buscar tesoro"],
  ["deposit", "🏦 Depositar"],
  ["withdraw", "🏦 Retirar"],
  ["pay", "💸 Pagar a alguien"],
  ["rich", "👑 Ranking de riqueza"],
  ["inventory", "🎒 Inventario"],
  ["level", "⭐ Ver nivel"],
  ["profile", "👤 Perfil económico"],
  ["stats", "📊 Estadísticas"],
  ["shop", "🛒 Tienda"],
  ["buy", "🛍️ Comprar"],
  ["sell", "💵 Vender"],
  ["job", "💼 Ver trabajo"],
  ["rent", "🏠 Cobrar alquiler"],
  ["interest", "🏦 Recibir intereses"],
  ["gift", "🎁 Regalar dinero"],
  ["leaderboard", "🏆 Ranking económico"]
];

const DIVERSION = [
  ["joke", "😂 Chiste"],
  ["8ball", "🎱 Pregunta a Madokami"],
  ["rps", "✊ Piedra, papel o tijera"],
  ["dice", "🎲 Tirar dado"],
  ["trivia", "🧠 Trivia"],
  ["choose", "🤔 Elegir entre opciones"],
  ["rate", "⭐ Valoración divertida"],
  ["ship", "💫 Compatibilidad divertida"],
  ["compliment", "💖 Cumplido"],
  ["roast", "🔥 Roast amistoso"],
  ["fortune", "🔮 Frase del día"],
  ["fact", "🧠 Dato curioso"],
  ["cat", "🐱 Gato"],
  ["dog", "🐶 Perro"],
  ["meme", "😂 Meme textual"],
  ["quote", "💬 Frase"],
  ["reverse", "🔄 Texto invertido"],
  ["upper", "🔠 MAYÚSCULAS"],
  ["lower", "🔡 minúsculas"],
  ["clap", "👏 Aplausos"],
  ["hug", "🤗 Abrazo virtual"],
  ["highfive", "🖐️ Choca esos cinco"],
  ["dance", "💃 Bailar"],
  ["sleep", "😴 Dormir"],
  ["coffee", "☕ Café"],
  ["magic", "✨ Magia"],
  ["emoji", "😀 Emoji aleatorio"],
  ["color", "🎨 Color aleatorio"],
  ["number", "🔢 Número aleatorio"],
  ["random", "🎲 Aleatorio"]
];

const UTILIDADES = [
  ["avatar", "🖼️ Avatar"],
  ["servericon", "🖼️ Icono del servidor"],
  ["userinfo", "👤 Información de usuario"],
  ["serverinfo", "🏠 Información del servidor"],
  ["roleinfo", "🎭 Información de rol"],
  ["channelinfo", "📺 Información del canal"],
  ["botinfo", "🤖 Información de Madokami"],
  ["ping", "🏓 Ping"],
  ["uptime", "⏱️ Tiempo activo"],
  ["timestamp", "🕐 Timestamp"],
  ["sayhelp", "📖 Ayuda de mensajes"],
  ["first", "👑 Primer miembro"],
  ["members", "👥 Miembros"],
  ["bots", "🤖 Bots"],
  ["humans", "👤 Humanos"],
  ["roles", "🎭 Cantidad de roles"],
  ["channels", "📺 Cantidad de canales"],
  ["textchannels", "💬 Canales de texto"],
  ["voicechannels", "🔊 Canales de voz"],
  ["emojis", "😀 Emojis"],
  ["boosts", "🚀 Boosts"],
  ["region", "🌍 Región"],
  ["created", "📅 Creación"],
  ["permissions", "🛡️ Tus permisos"],
  ["membercount", "👥 Contador"],
  ["joined", "📅 Fecha de entrada"],
  ["mention", "📣 Crear mención"],
  ["calc", "🧮 Calculadora"],
  ["help", "📚 Ayuda"]
];

const ESTADISTICAS = [
  ["mystats", "📊 Tus estadísticas"],
  ["rank", "🏆 Tu posición"],
  ["topxp", "⭐ Top XP"],
  ["topmoney", "💰 Top dinero"],
  ["topmessages", "💬 Top mensajes"],
  ["topcommands", "🤖 Top comandos"],
  ["guildstats", "🏠 Estadísticas servidor"],
  ["activity", "📈 Actividad"],
  ["levelstats", "⭐ Estadísticas nivel"],
  ["economystats", "💰 Estadísticas economía"],
  ["serverlevel", "🏆 Nivel del servidor"],
  ["membersstats", "👥 Estadísticas miembros"],
  ["rolestats", "🎭 Estadísticas roles"],
  ["channelstats", "📺 Estadísticas canales"],
  ["booststats", "🚀 Estadísticas boosts"],
  ["botstats", "🤖 Estadísticas bots"],
  ["humanstats", "👤 Estadísticas humanos"],
  ["xp", "⭐ Tu XP"],
  ["moneyrank", "💰 Posición económica"],
  ["xprank", "⭐ Posición XP"],
  ["messagerank", "💬 Posición mensajes"],
  ["commandrank", "🤖 Posición comandos"],
  ["earned", "💵 Dinero ganado"],
  ["spent", "💸 Dinero gastado"],
  ["messages", "💬 Tus mensajes"],
  ["commands", "🤖 Tus comandos"],
  ["guildxp", "⭐ XP del servidor"],
  ["guildmoney", "💰 Dinero del servidor"],
  ["overview", "📋 Resumen"]
];

const PERSONALIZACION = [
  ["setnickname", "✏️ Cambiar apodo"],
  ["setavatar", "🖼️ Ver avatar"],
  ["setstatus", "📡 Estado del servidor"],
  ["setcolor", "🎨 Color"],
  ["setbio", "📝 Biografía"],
  ["mysettings", "⚙️ Mis ajustes"],
  ["prefix", "🔧 Prefijo"],
  ["theme", "🎨 Tema"],
  ["language", "🌍 Idioma"],
  ["profilecolor", "🎨 Color de perfil"],
  ["profiletitle", "🏷️ Título"],
  ["profileemoji", "😀 Emoji"],
  ["profileview", "👤 Ver perfil"],
  ["banner", "🖼️ Banner"],
  ["serverbanner", "🖼️ Banner servidor"],
  ["servericon", "🖼️ Icono servidor"],
  ["rolelist", "🎭 Lista de roles"],
  ["channellist", "📺 Lista canales"],
  ["emojilist", "😀 Lista emojis"],
  ["memberlist", "👥 Lista miembros"],
  ["botlist", "🤖 Lista bots"],
  ["welcomeinfo", "🌸 Configuración bienvenida"],
  ["rules", "📜 Reglas"],
  ["social", "🌐 Redes"],
  ["links", "🔗 Enlaces"],
  ["support", "🆘 Soporte"],
  ["about", "🌸 Sobre Madokami"],
  ["commands", "📚 Comandos"],
  ["menu", "📋 Menú"],
  ["preferences", "⚙️ Preferencias"]
];

const LOGROS = [
  ["achievements", "🏆 Tus logros"],
  ["achievementslist", "🏆 Lista de logros"],
  ["firstwork", "💼 Primer trabajo"],
  ["firstdaily", "🎁 Primer daily"],
  ["richachievement", "💰 Riqueza"],
  ["levelachievement", "⭐ Nivel"],
  ["xpachievement", "✨ XP"],
  ["messageachievement", "💬 Mensajes"],
  ["commandachievement", "🤖 Comandos"],
  ["socialachievement", "👥 Social"],
  ["collector", "🎒 Coleccionista"],
  ["worker", "💼 Trabajador"],
  ["explorer", "🗺️ Explorador"],
  ["fisher", "🎣 Pescador"],
  ["miner", "⛏️ Minero"],
  ["farmer", "🌾 Agricultor"],
  ["helper", "🤝 Ayudante"],
  ["active", "🔥 Activo"],
  ["veteran", "👑 Veterano"],
  ["millionaire", "💰 Millonario"],
  ["level10", "⭐ Nivel 10"],
  ["level25", "⭐ Nivel 25"],
  ["level50", "⭐ Nivel 50"],
  ["messages100", "💬 100 mensajes"],
  ["commands100", "🤖 100 comandos"],
  ["xp1000", "✨ 1000 XP"],
  ["money10000", "💰 10.000 monedas"],
  ["money100000", "💰 100.000 monedas"],
  ["ultimate", "🌟 Logro definitivo"],
  ["progress", "📈 Progreso"]
];

const CATEGORIES = {
  economia: {
    title: "💰 ECONOMÍA",
    color: 0xf1c40f,
    list: ECONOMIA
  },
  diversion: {
    title: "🎮 DIVERSIÓN",
    color: 0xe91e63,
    list: DIVERSION
  },
  utilidades: {
    title: "🛠️ UTILIDADES",
    color: 0x3498db,
    list: UTILIDADES
  },
  estadisticas: {
    title: "📊 ESTADÍSTICAS",
    color: 0x2ecc71,
    list: ESTADISTICAS
  },
  personalizacion: {
    title: "🎨 PERSONALIZACIÓN",
    color: 0x9b59b6,
    list: PERSONALIZACION
  },
  logros: {
    title: "🏆 LOGROS",
    color: 0xe67e22,
    list: LOGROS
  },
  ia: {
    title: "🤖 INTELIGENCIA ARTIFICIAL",
    color: 0x5865f2,
    list: [
      ["ia", "🤖 Preguntar a Madokami AI"],
      ["ask", "🧠 Pregunta rápida"],
      ["imagen", "🖼️ Generar imagen"]
    ]
  }
};

// ============================================================
// HELP
// ============================================================

function categoryEmbed(category) {
  const data = CATEGORIES[category];

  let text = "";

  for (const [cmd, description] of data.list) {
    text += `\`${PREFIX}${cmd}\` — ${description}\n`;
  }

  return new EmbedBuilder()
    .setColor(data.color)
    .setTitle(`🌸 MADOKAMI • ${data.title}`)
    .setDescription(text)
    .addFields({
      name: "📌 Total",
      value: `${data.list.length} comandos`,
      inline: true
    })
    .setFooter({
      text: "Madokami • Selecciona otra categoría abajo"
    })
    .setTimestamp();
}

function helpMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_category")
      .setPlaceholder(
        "🌸 Selecciona una categoría..."
      )
      .addOptions([
        {
          label: "Economía",
          description: "30 comandos",
          value: "economia",
          emoji: "💰"
        },
        {
          label: "Diversión",
          description: "30 comandos",
          value: "diversion",
          emoji: "🎮"
        },
        {
          label: "Utilidades",
          description: "30 comandos",
          value: "utilidades",
          emoji: "🛠️"
        },
        {
          label: "Estadísticas",
          description: "30 comandos",
          value: "estadisticas",
          emoji: "📊"
        },
        {
          label: "Personalización",
          description: "30 comandos",
          value: "personalizacion",
          emoji: "🎨"
        },
        {
          label: "Logros",
          description: "30 comandos",
          value: "logros",
          emoji: "🏆"
        },
        {
          label: "IA",
          description: "3 comandos",
          value: "ia",
          emoji: "🤖"
        }
      ])
  );
}

function mainHelp() {
  return new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle("🌸 M A D O K A M I")
    .setDescription(
      "✨ **Centro oficial de comandos**\n\n" +
      "Madokami tiene un montón de herramientas para tu servidor.\n\n" +
      "Selecciona una categoría para ver sus comandos.\n\n" +
      "💰 **Economía** — 30\n" +
      "🎮 **Diversión** — 30\n" +
      "🛠️ **Utilidades** — 30\n" +
      "📊 **Estadísticas** — 30\n" +
      "🎨 **Personalización** — 30\n" +
      "🏆 **Logros** — 30\n" +
      "🤖 **IA** — 3\n\n" +
      "🛡️ Administración: `m!helpad`"
    )
    .addFields(
      {
        name: "🌸 Prefijo",
        value: "`m!`",
        inline: true
      },
      {
        name: "🤖 IA",
        value: "`m!ia`",
        inline: true
      },
      {
        name: "🛡️ Admin",
        value: "`m!helpad`",
        inline: true
      }
    )
    .setThumbnail(
      client.user?.displayAvatarURL() || null
    )
    .setFooter({
      text: "Madokami • Hecho para Discord"
    })
    .setTimestamp();
}

// ============================================================
// READY
// ============================================================

client.once(
  Events.ClientReady,
  () => {
    console.log(
      `🌸 MADOKAMI conectado como ${client.user.tag}`
    );

    client.user.setActivity(
      "m!help • Madokami",
      { type: 0 }
    );
  }
);

// ============================================================
// INTERACTIONS
// ============================================================

client.on(
  Events.InteractionCreate,
  async interaction => {
    if (!interaction.isStringSelectMenu()) {
      return;
    }

    if (
      interaction.customId !==
      "madokami_category"
    ) {
      return;
    }

    const category =
      interaction.values[0];

    if (!CATEGORIES[category]) {
      return interaction.reply({
        content: "❌ Categoría inválida.",
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    await interaction.editReply({
      embeds: [
        categoryEmbed(category)
      ],
      components: [
        helpMenu()
      ]
    });
  }
);

// ============================================================
// WELCOME
// ============================================================

client.on(
  Events.GuildMemberAdd,
  async member => {
    const config =
      guildData(member.guild.id).config;

    if (!config.welcome) return;
    if (!config.welcomeChannel) return;

    const channel =
      member.guild.channels.cache.get(
        config.welcomeChannel
      );

    if (!channel) return;

    const text =
      config.welcomeMessage
        .replaceAll(
          "{user}",
          `${member}`
        )
        .replaceAll(
          "{server}",
          member.guild.name
        );

    await channel.send({
      embeds: [
        embed(
          "🌸 ¡Bienvenido/a!",
          text
        )
      ]
    });

    await log(
      member.guild,
      "👋 Entrada",
      `${member} entró al servidor.`
    );
  }
);

// ============================================================
// SPAM
// ============================================================

const spamMap = new Map();

function spamDetected(message) {
  const config =
    guildData(message.guild.id).config;

  if (!config.antiSpam) return false;
  if (admin(message.member)) return false;
  if (
    whitelisted(
      message.guild.id,
      message.author.id
    )
  ) {
    return false;
  }

  const key =
    `${message.guild.id}:${message.author.id}`;

  const now = Date.now();

  if (!spamMap.has(key)) {
    spamMap.set(key, []);
  }

  const times =
    spamMap.get(key);

  times.push(now);

  while (
    times.length &&
    now - times[0] > 5000
  ) {
    times.shift();
  }

  return times.length > 5;
}

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(
  Events.MessageCreate,
  async message => {
    if (!message.guild) return;
    if (message.author.bot) return;

    const guild =
      guildData(message.guild.id);

    const user =
      userData(
        message.guild.id,
        message.author.id
      );

    user.stats.messages++;

    // ========================================================
    // AUTO RESPUESTAS
    // ========================================================

    if (
      !message.content.startsWith(PREFIX)
    ) {
      const responses =
        guild.config.autoResponses;

      for (const trigger of Object.keys(responses)) {
        if (
          message.content
            .toLowerCase()
            .includes(trigger.toLowerCase())
        ) {
          await message.channel.send(
            responses[trigger]
          );
          break;
        }
      }
    }

    // ========================================================
    // AUTO REACCIONES
    // ========================================================

    if (
      !message.content.startsWith(PREFIX)
    ) {
      const reactions =
        guild.config.autoReactions;

      for (const trigger of Object.keys(reactions)) {
        if (
          message.content
            .toLowerCase()
            .includes(trigger.toLowerCase())
        ) {
          try {
            await message.react(
              reactions[trigger]
            );
          } catch {}
          break;
        }
      }
    }

    // ========================================================
    // ANTI LINK
    // ========================================================

    const url =
      /(https?:\/\/|www\.|discord\.gg\/)/i;

    if (
      guild.config.antiLink &&
      url.test(message.content) &&
      !admin(message.member) &&
      !whitelisted(
        message.guild.id,
        message.author.id
      )
    ) {
      try {
        await message.delete();
      } catch {}

      try {
        await message.member.timeout(
          2 * 60 * 60 * 1000,
          "Madokami Anti-Link"
        );
      } catch {}

      const warning =
        await message.channel.send(
          `🚫 ${message.author} no puedes enviar enlaces aquí.`
        );

      setTimeout(() => {
        warning.delete().catch(() => {});
      }, 5000);

      await log(
        message.guild,
        "🔗 Anti-Link",
        `Mensaje de ${message.author} eliminado.\nTimeout: 2 horas.`
      );

      return;
    }

    // ========================================================
    // ANTI SPAM
    // ========================================================

    if (spamDetected(message)) {
      try {
        await message.delete();
      } catch {}

      const warning =
        await message.channel.send(
          `🚫 ${message.author}, estás enviando mensajes demasiado rápido.`
        );

      setTimeout(() => {
        warning.delete().catch(() => {});
      }, 4000);

      await log(
        message.guild,
        "🚫 Anti-Spam",
        `Spam detectado de ${message.author}.`
      );

      return;
    }

    // ========================================================
    // PREFIX
    // ========================================================

    if (
      !message.content.startsWith(PREFIX)
    ) {
      saveDB();
      return;
    }

    const args =
      message.content
        .slice(PREFIX.length)
        .trim()
        .split(/\s+/);

    const command =
      (args.shift() || "").toLowerCase();

    if (!command) return;

    user.stats.commands++;

    // ========================================================
    // HELP
    // ========================================================

    if (command === "help") {
      return message.reply({
        embeds: [mainHelp()],
        components: [helpMenu()]
      });
    }

    // ========================================================
    // HELP ADMIN
    // ========================================================

    if (command === "helpad") {
      if (!admin(message.member)) {
        return message.reply(
          "🛡️ Solo administradores."
        );
      }

      const e = new EmbedBuilder()
        .setColor(0xe74c3c)
        .setTitle("🛡️ MADOKAMI • PANEL ADMIN")
        .setDescription(
          "Herramientas exclusivas para administrar el servidor."
        )
        .addFields(
          {
            name: "🔨 MODERACIÓN",
            value:
              "`m!ban`\n" +
              "`m!unban`\n" +
              "`m!kick`\n" +
              "`m!mute`\n" +
              "`m!unmute`\n" +
              "`m!warn`\n" +
              "`m!warnings`\n" +
              "`m!clear`\n" +
              "`m!lock`\n" +
              "`m!unlock`\n" +
              "`m!slowmode`"
          },
          {
            name: "🛡️ SEGURIDAD",
            value:
              "`m!antilink`\n" +
              "`m!antispam`\n" +
              "`m!whitelist`\n" +
              "`m!whitelistadd`\n" +
              "`m!whitelistremove`\n" +
              "`m!whitelistlist`"
          },
          {
            name: "🤖 AUTOMATIZACIÓN",
            value:
              "`m!autorrespuesta`\n" +
              "`m!autorrespuestaoff`\n" +
              "`m!reaccion`\n" +
              "`m!reaccionoff`"
          },
          {
            name: "📢 MENSAJES",
            value:
              "`m!say`\n" +
              "`m!announce`\n" +
              "`m!embed`"
          },
          {
            name: "📋 CONFIGURACIÓN",
            value:
              "`m!log`\n" +
              "`m!welcome`"
          }
        )
        .setFooter({
          text: "Madokami • Administración"
        })
        .setTimestamp();

      return message.reply({
        embeds: [e]
      });
    }

    // ========================================================
    // IA
    // ========================================================

    if (
      command === "ia" ||
      command === "ask"
    ) {
      const prompt =
        args.join(" ");

      if (!prompt) {
        return message.reply(
          `🤖 Usa \`${PREFIX}${command} <pregunta>\``
        );
      }

      await message.channel.sendTyping();

      try {
        const answer =
          await askAI(prompt);

        return longReply(
          message,
          `🤖 **Madokami AI**\n\n${answer}`
        );
      } catch (err) {
        console.error(
          "GEMINI:",
          err
        );

        return message.reply(
          "❌ No pude usar Gemini. Comprueba que `GEMINI_API_KEY` esté correctamente configurada en Render."
        );
      }
    }

    if (command === "imagen") {
      const prompt =
        args.join(" ");

      if (!prompt) {
        return message.reply(
          `🖼️ Usa \`${PREFIX}imagen <descripción>\``
        );
      }

      await message.channel.sendTyping();

      try {
        const buffer =
          await makeImage(prompt);

        const file =
          new AttachmentBuilder(
            buffer,
            {
              name: "madokami-image.png"
            }
          );

        return message.reply({
          content:
            "🌸 **Imagen generada por Madokami AI**",
          files: [file]
        });
      } catch (err) {
        console.error(
          "GEMINI IMAGE:",
          err
        );

        return message.reply(
          "❌ Gemini no pudo generar la imagen."
        );
      }
    }

    // ========================================================
    // ECONOMÍA 1-30
    // ========================================================

    if (command === "balance") {
      return message.reply(
        `💰 Cartera: **${money(user.wallet)}**\n🏦 Banco: **${money(user.bank)}**`
      );
    }

    if (command === "work") {
      const wait =
        cd(user, "work", 30);

      if (wait) {
        return message.reply(
          `⏳ Espera **${wait}s**.`
        );
      }

      const amount =
        random(100, 300);

      addMoney(user, amount);
      addXP(user, 15);

      return message.reply(
        `💼 Trabajaste y ganaste **${money(amount)}**.`
      );
    }

    if (command === "daily") {
      const wait =
        cd(user, "daily", 86400);

      if (wait) {
        return message.reply(
          "⏳ Ya reclamaste tu recompensa diaria."
        );
      }

      addMoney(user, 500);
      addXP(user, 25);

      return message.reply(
        "🎁 Recibiste **500 💰** de recompensa diaria."
      );
    }

    if (command === "weekly") {
      const wait =
        cd(user, "weekly", 604800);

      if (wait) {
        return message.reply(
          "⏳ Ya reclamaste tu recompensa semanal."
        );
      }

      addMoney(user, 3000);
      addXP(user, 100);

      return message.reply(
        "📅 Recibiste **3.000 💰** de recompensa semanal."
      );
    }

    if (command === "bonus") {
      const wait =
        cd(user, "bonus", 43200);

      if (wait) {
        return message.reply(
          "⏳ Ya reclamaste tu bonus."
        );
      }

      addMoney(user, 350);

      return message.reply(
        "🎁 Recibiste **350 💰** de bonus."
      );
    }

    if (command === "salary") {
      const wait =
        cd(user, "salary", 86400);

      if (wait) {
        return message.reply(
          "⏳ Ya cobraste tu salario."
        );
      }

      addMoney(user, 750);

      return message.reply(
        "💼 Recibiste tu salario: **750 💰**."
      );
    }

    if (command === "quest") {
      const wait =
        cd(user, "quest", 3600);

      if (wait) {
        return message.reply(
          "⏳ Ya completaste una misión."
        );
      }

      addMoney(user, 600);
      addXP(user, 50);

      return message.reply(
        "📜 Misión completada: **600 💰 + 50 XP**."
      );
    }

    if (command === "fish") {
      const wait =
        cd(user, "fish", 45);

      if (wait) {
        return message.reply(
          `🎣 Espera **${wait}s**.`
        );
      }

      const amount =
        random(120, 280);

      addMoney(user, amount);
      addXP(user, 10);

      return message.reply(
        `🎣 Pescaste y ganaste **${money(amount)}**.`
      );
    }

    if (command === "mine") {
      const wait =
        cd(user, "mine", 60);

      if (wait) {
        return message.reply(
          `⛏️ Espera **${wait}s**.`
        );
      }

      const amount =
        random(150, 350);

      addMoney(user, amount);
      addXP(user, 15);

      return message.reply(
        `⛏️ Encontraste minerales por **${money(amount)}**.`
      );
    }

    if (command === "farm") {
      const wait =
        cd(user, "farm", 60);

      if (wait) {
        return message.reply(
          `🌾 Espera **${wait}s**.`
        );
      }

      const amount =
        random(180, 400);

      addMoney(user, amount);
      addXP(user, 15);

      return message.reply(
        `🌾 Vendiste tu cosecha por **${money(amount)}**.`
      );
    }

    if (command === "hunt") {
      const wait =
        cd(user, "hunt", 90);

      if (wait) {
        return message.reply(
          `🏹 Espera **${wait}s**.`
        );
      }

      const amount =
        random(200, 400);

      addMoney(user, amount);

      return message.reply(
        `🏹 Encontraste recursos por **${money(amount)}**.`
      );
    }

    if (command === "collect") {
      const wait =
        cd(user, "collect", 45);

      if (wait) {
        return message.reply(
          `🧺 Espera **${wait}s**.`
        );
      }

      const amount =
        random(100, 250);

      addMoney(user, amount);

      return message.reply(
        `🧺 Recolectaste recursos por **${money(amount)}**.`
      );
    }

    if (command === "delivery") {
      const wait =
        cd(user, "delivery", 90);

      if (wait) {
        return message.reply(
          `🚚 Espera **${wait}s**.`
        );
      }

      const amount =
        random(250, 450);

      addMoney(user, amount);
      addXP(user, 20);

      return message.reply(
        `🚚 Entrega completada: **${money(amount)}**.`
      );
    }

    if (command === "treasure") {
      const wait =
        cd(user, "treasure", 300);

      if (wait) {
        return message.reply(
          `🗺️ Espera **${wait}s**.`
        );
      }

      addMoney(user, 800);

      return message.reply(
        "🗺️ Encontraste un tesoro de **800 💰**."
      );
    }

    if (command === "deposit") {
      const amount =
        parseInt(args[0]);

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "🏦 Cantidad inválida."
        );
      }

      if (user.wallet < amount) {
        return message.reply(
          "❌ No tienes suficiente dinero."
        );
      }

      user.wallet -= amount;
      user.bank += amount;

      return message.reply(
        `🏦 Depositaste **${money(amount)}**.`
      );
    }

    if (command === "withdraw") {
      const amount =
        parseInt(args[0]);

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "🏦 Cantidad inválida."
        );
      }

      if (user.bank < amount) {
        return message.reply(
          "❌ No tienes suficiente dinero en el banco."
        );
      }

      user.bank -= amount;
      user.wallet += amount;

      return message.reply(
        `🏦 Retiraste **${money(amount)}**.`
      );
    }

    if (command === "pay") {
      const target =
        message.mentions.users.first();

      const amount =
        parseInt(args[1]);

      if (!target) {
        return message.reply(
          "💸 Menciona al usuario."
        );
      }

      if (
        !Number.isInteger(amount) ||
        amount <= 0
      ) {
        return message.reply(
          "💸 Cantidad inválida."
        );
      }

      if (user.wallet < amount) {
        return message.reply(
          "❌ No tienes suficiente dinero."
        );
      }

      const targetData =
        userData(
          message.guild.id,
          target.id
        );

      user.wallet -= amount;
      targetData.wallet += amount;

      return message.reply(
        `💸 Enviaste **${money(amount)}** a ${target}.`
      );
    }

    if (command === "rich" ||
        command === "leaderboard") {

      const ranking =
        Object.entries(guild.users)
          .sort(
            (a, b) =>
              (b[1].wallet + b[1].bank) -
              (a[1].wallet + a[1].bank)
          )
          .slice(0, 10);

      let text = "";

      ranking.forEach(
        ([id, data], index) => {
          text +=
            `**${index + 1}.** <@${id}> — ${money(data.wallet + data.bank)}\n`;
        }
      );

      return message.reply({
        embeds: [
          embed(
            "👑 TOP RIQUEZA",
            text || "Todavía no hay datos.",
            0xf1c40f
          )
        ]
      });
    }

    if (command === "inventory") {
      return message.reply({
        embeds: [
          embed(
            "🎒 INVENTARIO",
            user.inventory.length
              ? user.inventory.join("\n")
              : "Tu inventario está vacío."
          )
        ]
      });
    }

    if (command === "level") {
      return message.reply(
        `⭐ Nivel: **${user.level}**\n✨ XP: **${user.xp}/${user.level * 100}**`
      );
    }

    if (command === "profile") {
      return message.reply({
        embeds: [
          embed(
            `👤 PERFIL DE ${message.author.username}`,
            `💰 Cartera: **${money(user.wallet)}**\n` +
            `🏦 Banco: **${money(user.bank)}**\n` +
            `⭐ Nivel: **${user.level}**\n` +
            `✨ XP: **${user.xp}**`
          )
        ]
      });
    }

    if (command === "stats") {
      return message.reply({
        embeds: [
          embed(
            "📊 TUS ESTADÍSTICAS",
            `💰 Ganado: **${money(user.stats.earned)}**\n` +
            `💸 Gastado: **${money(user.stats.spent)}**\n` +
            `🤖 Comandos: **${user.stats.commands}**\n` +
            `💬 Mensajes: **${user.stats.messages}**`
          )
        ]
      });
    }

    if (command === "shop") {
      return message.reply({
        embeds: [
          embed(
            "🛒 TIENDA",
            "🎒 Mochila — 500 💰\n" +
            "⭐ Medalla — 1.000 💰\n" +
            "🌸 Flor — 250 💰\n" +
            "💎 Cristal — 2.000 💰"
          )
        ]
      });
    }

    if (command === "buy") {
      const item =
        args.join(" ").toLowerCase();

      const prices = {
        mochila: 500,
        medalla: 1000,
        flor: 250,
        cristal: 2000
      };

      if (!prices[item]) {
        return message.reply(
          "🛒 Artículo no encontrado. Usa `m!shop`."
        );
      }

      if (user.wallet < prices[item]) {
        return message.reply(
          "❌ No tienes suficiente dinero."
        );
      }

      user.wallet -= prices[item];
      user.stats.spent += prices[item];
      user.inventory.push(item);

      return message.reply(
        `🛍️ Compraste **${item}** por **${money(prices[item])}**.`
      );
    }

    if (command === "sell") {
      const item =
        args.join(" ").toLowerCase();

      const prices = {
        mochila: 350,
        medalla: 700,
        flor: 150,
        cristal: 1400
      };

      const index =
        user.inventory.indexOf(item);

      if (index === -1) {
        return message.reply(
          "❌ No tienes ese artículo."
        );
      }

      user.inventory.splice(index, 1);

      const amount =
        prices[item] || 100;

      addMoney(user, amount);

      return message.reply(
        `💵 Vendiste **${item}** por **${money(amount)}**.`
      );
    }

    if (command === "job") {
      return message.reply(
        "💼 Tu trabajo actual: **Trabajador de Madokami**\n💰 Usa `m!work` para trabajar."
      );
    }

    if (command === "rent") {
      const wait =
        cd(user, "rent", 3600);

      if (wait) {
        return message.reply(
          `🏠 El alquiler estará disponible en **${wait}s**.`
        );
      }

      addMoney(user, 300);

      return message.reply(
        "🏠 Recibiste **300 💰** de alquiler."
      );
    }

    if (command === "interest") {
      const wait =
        cd(user, "interest", 86400);

      if (wait) {
        return message.reply(
          "⏳ Ya recibiste los intereses de hoy."
        );
      }

      const amount =
        Math.floor(user.bank * 0.02);

      const finalAmount =
        Math.max(amount, 10);

      user.bank += finalAmount;

      return message.reply(
        `🏦 Tus intereses generaron **${money(finalAmount)}**.`
      );
    }

    if (command === "gift") {
      const target =
        message.mentions.users.first();

      const amount =
        parseInt(args[1]);

      if (!target || !amount || amount <= 0) {
        return message.reply(
          "🎁 Usa `m!gift @usuario cantidad`."
        );
      }

      if (user.wallet < amount) {
        return message.reply(
          "❌ No tienes suficiente dinero."
        );
      }

      const targetData =
        userData(
          message.guild.id,
          target.id
        );

      user.wallet -= amount;
      targetData.wallet += amount;

      return message.reply(
        `🎁 Regalaste **${money(amount)}** a ${target}.`
      );
    }

    // ========================================================
    // DIVERSIÓN
    // ========================================================

    if (command === "joke") {
      const jokes = [
        "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
        "😂 ¿Cuál es el colmo de un jardinero? Que siempre lo dejen plantado.",
        "😂 ¿Qué le dijo un techo a otro? Techo de menos.",
        "😂 ¿Qué hace una computadora cuando tiene frío? Cierra Windows."
      ];

      return message.reply(
        jokes[random(0, jokes.length - 1)]
      );
    }

    if (command === "8ball") {
      const answers = [
        "✨ Sí.",
        "🌸 Probablemente.",
        "🤔 Puede ser.",
        "❌ No.",
        "🔮 El futuro no está claro."
      ];

      return message.reply(
        `🎱 ${answers[random(0, answers.length - 1)]}`
      );
    }

    if (command === "rps") {
      const choice =
        args[0]?.toLowerCase();

      const options = [
        "piedra",
        "papel",
        "tijera"
      ];

      if (!options.includes(choice)) {
        return message.reply(
          "✊ Usa `m!rps piedra`, `m!rps papel` o `m!rps tijera`."
        );
      }

      const bot =
        options[random(0, 2)];

      let result;

      if (choice === bot) {
        result = "🤝 Empate.";
      } else if (
        (choice === "piedra" && bot === "tijera") ||
        (choice === "papel" && bot === "piedra") ||
        (choice === "tijera" && bot === "papel")
      ) {
        result = "🎉 ¡Ganaste!";
      } else {
        result = "😎 Madokami ganó.";
      }

      return message.reply(
        `Tu elección: **${choice}**\nMadokami: **${bot}**\n\n${result}`
      );
    }

    if (command === "dice") {
      return message.reply(
        `🎲 Sacaste un **${random(1, 6)}**.`
      );
    }

    if (command === "trivia") {
      const questions = [
        ["¿Cuál es el planeta más grande?", "Júpiter"],
        ["¿Cuántos lados tiene un hexágono?", "6"],
        ["¿Cuál es la capital de Francia?", "París"],
        ["¿Qué gas respiramos principalmente?", "Oxígeno"],
        ["¿Cuánto es 5 × 5?", "25"]
      ];

      const q =
        questions[random(0, questions.length - 1)];

      return message.reply(
        `🧠 **TRIVIA**\n\n${q[0]}\n\nRespuesta: ||${q[1]}||`
      );
    }

    if (command === "choose") {
      const choices =
        args.join(" ")
          .split("|")
          .map(x => x.trim())
          .filter(Boolean);

      if (choices.length < 2) {
        return message.reply(
          "🤔 Usa `m!choose pizza | hamburguesa`."
        );
      }

      return message.reply(
        `🤔 Elijo: **${choices[random(0, choices.length - 1)]}**`
      );
    }

    if (command === "rate") {
      const target =
        message.mentions.users.first() ||
        message.author;

      return message.reply(
        `⭐ Mi valoración de ${target}: **${random(1, 10)}/10**`
      );
    }

    if (command === "ship") {
      const a =
        message.mentions.users.first();

      if (!a) {
        return message.reply(
          "💫 Menciona a alguien."
        );
      }

      return message.reply(
        `💫 Compatibilidad divertida entre ${message.author} y ${a}: **${random(1, 100)}%**`
      );
    }

    if (command === "compliment") {
      return message.reply(
        `💖 ${message.author}, eres una persona genial.`
      );
    }

    if (command === "roast") {
      return message.reply(
        `🔥 Roast amistoso para ${message.author}: tienes más lag que un servidor con Wi-Fi de cafetería 😂`
      );
    }

    if (command === "fortune") {
      const fortunes = [
        "🌸 Hoy puede ser un buen día para aprender algo nuevo.",
        "✨ Una sorpresa podría alegrarte el día.",
        "💫 Sigue avanzando paso a paso.",
        "🌟 Tu próximo proyecto puede quedar genial."
      ];

      return message.reply(
        fortunes[random(0, fortunes.length - 1)]
      );
    }

    if (command === "fact") {
      return message.reply(
        "🧠 Dato curioso: los pulpos tienen tres corazones."
      );
    }

    if (command === "cat") {
      return message.reply(
        "🐱 /ᐠ｡ꞈ｡ᐟ\\"
      );
    }

    if (command === "dog") {
      return message.reply(
        "🐶 / \\__\n(    @\\___\n /         O\n/   (_____/\n/_____/   U"
      );
    }

    if (command === "meme") {
      return message.reply(
        "😂 **Cuando dices que solo vas a jugar 5 minutos:**\n\n3 horas después..."
      );
    }

    if (command === "quote") {
      return message.reply(
        "💬 \"Cada pequeño paso cuenta.\""
      );
    }

    if (command === "reverse") {
      return message.reply(
        (args.join(" ") || "Escribe algo.")
          .split("")
          .reverse()
          .join("")
      );
    }

    if (command === "upper") {
      return message.reply(
        args.join(" ").toUpperCase() || "Escribe algo."
      );
    }

    if (command === "lower") {
      return message.reply(
        args.join(" ").toLowerCase() || "Escribe algo."
      );
    }

    if (command === "clap") {
      return message.reply(
        "👏 👏 👏 👏 👏"
      );
    }

    if (command === "hug") {
      return message.reply(
        `🤗 ${message.author} recibe un abrazo virtual.`
      );
    }

    if (command === "highfive") {
      return message.reply(
        `🖐️ ${message.author} chocó los cinco con Madokami.`
      );
    }

    if (command === "dance") {
      return message.reply(
        "💃🕺✨ ¡Madokami está bailando!"
      );
    }

    if (command === "sleep") {
      return message.reply(
        "😴 Zzz... Madokami se fue a dormir."
      );
    }

    if (command === "coffee") {
      return message.reply(
        "☕ Aquí tienes un café virtual."
      );
    }

    if (command === "magic") {
      return message.reply(
        "✨ *Hace aparecer una lluvia de estrellas* 🌟"
      );
    }

    if (command === "emoji") {
      const emojis = [
        "😀","😂","😎","🤯","🥳",
        "🌸","⭐","🔥","💀","👀"
      ];

      return message.reply(
        emojis[random(0, emojis.length - 1)]
      );
    }

    if (command === "color") {
      const colors = [
        "🔴 Rojo",
        "🟠 Naranja",
        "🟡 Amarillo",
        "🟢 Verde",
        "🔵 Azul",
        "🟣 Morado",
        "⚫ Negro",
        "⚪ Blanco"
      ];

      return message.reply(
        colors[random(0, colors.length - 1)]
      );
    }

    if (command === "number") {
      return message.reply(
        `🔢 Número aleatorio: **${random(1, 100)}**`
      );
    }

    if (command === "random") {
      return message.reply(
        `🎲 Tu número aleatorio es **${random(1, 1000)}**.`
      );
    }

    // ========================================================
    // UTILIDADES
    // ========================================================

    if (command === "avatar") {
      const target =
        message.mentions.users.first() ||
        message.author;

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🖼️ Avatar de ${target.username}`)
            .setImage(
              target.displayAvatarURL({
                size: 1024
              })
            )
            .setColor(0x9b59b6)
        ]
      });
    }

    if (command === "servericon") {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🖼️ Icono del servidor")
            .setImage(
              message.guild.iconURL({
                size: 1024
              }) || null
            )
            .setColor(0x9b59b6)
        ]
      });
    }

    if (command === "userinfo") {
      const target =
        message.mentions.members.first() ||
        message.member;

      return message.reply({
        embeds: [
          embed(
            `👤 ${target.user.username}`,
            `ID: \`${target.id}\`\n` +
            `Cuenta: <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>\n` +
            `Entró: <t:${Math.floor(target.joinedTimestamp / 1000)}:F>`
          )
        ]
      });
    }

    if (command === "serverinfo") {
      return message.reply({
        embeds: [
          embed(
            `🏠 ${message.guild.name}`,
            `👥 Miembros: **${message.guild.memberCount}**\n` +
            `🎭 Roles: **${message.guild.roles.cache.size}**\n` +
            `📺 Canales: **${message.guild.channels.cache.size}**\n` +
            `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`
          )
        ]
      });
    }

    if (command === "roleinfo") {
      const role =
        message.mentions.roles.first();

      if (!role) {
        return message.reply(
          "🎭 Menciona un rol."
        );
      }

      return message.reply(
        `🎭 **${role.name}**\nID: \`${role.id}\`\nMiembros: **${role.members.size}**`
      );
    }

    if (command === "channelinfo") {
      return message.reply(
        `📺 Canal: **${message.channel.name}**\nID: \`${message.channel.id}\`\nTipo: **${message.channel.type}**`
      );
    }

    if (command === "botinfo") {
      return message.reply({
        embeds: [
          embed(
            "🤖 MADOKAMI",
            `🌸 Bot: **Madokami**\n` +
            `📚 Discord.js v14\n` +
            `⚡ Prefijo: \`${PREFIX}\`\n` +
            `🏠 Servidores: **${client.guilds.cache.size}**`
          )
        ]
      });
    }

    if (command === "ping") {
      return message.reply(
        `🏓 Pong!\nLatencia: **${client.ws.ping}ms**`
      );
    }

    if (command === "uptime") {
      const seconds =
        Math.floor(process.uptime());

      return message.reply(
        `⏱️ Madokami lleva activo **${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s**.`
      );
    }

    if (command === "timestamp") {
      return message.reply(
        `🕐 <t:${Math.floor(Date.now() / 1000)}:F>`
      );
    }

    if (command === "sayhelp") {
      return message.reply(
        "📖 `m!say <mensaje>` permite a un administrador enviar un mensaje como Madokami."
      );
    }

    if (command === "first") {
      const members =
        await message.guild.members.fetch();

      const first =
        members
          .filter(m => !m.user.bot)
          .sort(
            (a, b) =>
              a.user.createdTimestamp -
              b.user.createdTimestamp
          )
          .first();

      return message.reply(
        first
          ? `👑 La cuenta más antigua encontrada es ${first}.`
          : "No hay datos."
      );
    }

    if (command === "members") {
      return message.reply(
        `👥 Miembros: **${message.guild.memberCount}**`
      );
    }

    if (command === "bots") {
      return message.reply(
        `🤖 Bots: **${message.guild.members.cache.filter(m => m.user.bot).size}**`
      );
    }

    if (command === "humans") {
      return message.reply(
        `👤 Humanos: **${message.guild.members.cache.filter(m => !m.user.bot).size}**`
      );
    }

    if (command === "roles") {
      return message.reply(
        `🎭 Roles: **${message.guild.roles.cache.size}**`
      );
    }

    if (command === "channels") {
      return message.reply(
        `📺 Canales: **${message.guild.channels.cache.size}**`
      );
    }

    if (command === "textchannels") {
      return message.reply(
        `💬 Canales de texto: **${message.guild.channels.cache.filter(c => c.type === ChannelType.GuildText).size}**`
      );
    }

    if (command === "voicechannels") {
      return message.reply(
        `🔊 Canales de voz: **${message.guild.channels.cache.filter(c => c.type === ChannelType.GuildVoice).size}**`
      );
    }

    if (command === "emojis") {
      return message.reply(
        `😀 Emojis: **${message.guild.emojis.cache.size}**`
      );
    }

    if (command === "boosts") {
      return message.reply(
        `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**`
      );
    }

    if (command === "region") {
      return message.reply(
        "🌍 Discord gestiona actualmente la ubicación del servidor automáticamente."
      );
    }

    if (command === "created") {
      return message.reply(
        `📅 Creado: <t:${Math.floor(message.guild.createdTimestamp / 1000)}:F>`
      );
    }

    if (command === "permissions") {
      return message.reply(
        `🛡️ Tus permisos:\n${message.member.permissions.toArray().map(p => `• ${p}`).join("\n")}`
      );
    }

    if (command === "membercount") {
      return message.reply(
        `👥 **${message.guild.memberCount}** miembros.`
      );
    }

    if (command === "joined") {
      return message.reply(
        `📅 Entraste: <t:${Math.floor(message.member.joinedTimestamp / 1000)}:F>`
      );
    }

    if (command === "mention") {
      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          "📣 Menciona a alguien."
        );
      }

      return message.reply(
        `📣 ${target}`
      );
    }

    if (command === "calc") {
      const expression =
        args.join("");

      if (
        !/^[0-9+\-*/().%\s]+$/.test(
          expression
        )
      ) {
        return message.reply(
          "🧮 Solo se permiten operaciones matemáticas básicas."
        );
      }

      try {
        const result =
          Function(
            `"use strict"; return (${expression})`
          )();

        return message.reply(
          `🧮 Resultado: **${result}**`
        );
      } catch {
        return message.reply(
          "❌ Operación inválida."
        );
      }
    }

    // ========================================================
    // ESTADÍSTICAS
    // ========================================================

    const statCommands = [
      "mystats",
      "activity",
      "levelstats",
      "economystats",
      "xp",
      "xprank",
      "moneyrank",
      "messagerank",
      "commandrank",
      "earned",
      "spent",
      "messages",
      "commands",
      "overview"
    ];

    if (statCommands.includes(command)) {
      const all =
        Object.entries(guild.users);

      const xpRank =
        all.sort(
          (a, b) =>
            (b[1].level * 100 + b[1].xp) -
            (a[1].level * 100 + a[1].xp)
        );

      const moneyRank =
        [...all].sort(
          (a, b) =>
            (b[1].wallet + b[1].bank) -
            (a[1].wallet + a[1].bank)
        );

      const messageRank =
        [...all].sort(
          (a, b) =>
            b[1].stats.messages -
            a[1].stats.messages
        );

      const commandRank =
        [...all].sort(
          (a, b) =>
            b[1].stats.commands -
            a[1].stats.commands
        );

      if (
        command === "mystats" ||
        command === "overview"
      ) {
        return message.reply({
          embeds: [
            embed(
              "📊 TU RESUMEN",
              `💰 Dinero: **${money(user.wallet + user.bank)}**\n` +
              `⭐ Nivel: **${user.level}**\n` +
              `✨ XP: **${user.xp}**\n` +
              `💬 Mensajes: **${user.stats.messages}**\n` +
              `🤖 Comandos: **${user.stats.commands}**`
            )
          ]
        });
      }

      if (command === "xp") {
        return message.reply(
          `⭐ Tu XP: **${user.xp}**`
        );
      }

      if (command === "earned") {
        return message.reply(
          `💵 Has ganado **${money(user.stats.earned)}**.`
        );
      }

      if (command === "spent") {
        return message.reply(
          `💸 Has gastado **${money(user.stats.spent)}**.`
        );
      }

      if (command === "messages") {
        return message.reply(
          `💬 Has enviado **${user.stats.messages}** mensajes.`
        );
      }

      if (command === "commands") {
        return message.reply(
          `🤖 Has usado **${user.stats.commands}** comandos.`
        );
      }

      if (
        command === "xprank" ||
        command === "rank"
      ) {
        const position =
          xpRank.findIndex(
            x => x[0] === message.author.id
          ) + 1;

        return message.reply(
          `🏆 Tu posición de XP: **#${position}**`
        );
      }

      if (command === "moneyrank") {
        const position =
          moneyRank.findIndex(
            x => x[0] === message.author.id
          ) + 1;

        return message.reply(
          `💰 Tu posición económica: **#${position}**`
        );
      }

      if (command === "messagerank") {
        const position =
          messageRank.findIndex(
            x => x[0] === message.author.id
          ) + 1;

        return message.reply(
          `💬 Tu posición por mensajes: **#${position}**`
        );
      }

      if (command === "commandrank") {
        const position =
          commandRank.findIndex(
            x => x[0] === message.author.id
          ) + 1;

        return message.reply(
          `🤖 Tu posición por comandos: **#${position}**`
        );
      }

      if (command === "activity") {
        return message.reply(
          `📈 Actividad: **${user.stats.messages} mensajes** y **${user.stats.commands} comandos**.`
        );
      }

      if (command === "levelstats") {
        return message.reply(
          `⭐ Nivel: **${user.level}**\n✨ XP: **${user.xp}/${user.level * 100}**`
        );
      }

      if (command === "economystats") {
        return message.reply(
          `💰 Dinero total: **${money(user.wallet + user.bank)}**\n💵 Ganado: **${money(user.stats.earned)}**\n💸 Gastado: **${money(user.stats.spent)}**`
        );
      }
    }

    if (
      [
        "topxp",
        "topmoney",
        "topmessages",
        "topcommands"
      ].includes(command)
    ) {
      let arr =
        Object.entries(guild.users);

      if (command === "topxp") {
        arr.sort(
          (a, b) =>
            b[1].xp - a[1].xp
        );
      }

      if (command === "topmoney") {
        arr.sort(
          (a, b) =>
            (b[1].wallet + b[1].bank) -
            (a[1].wallet + a[1].bank)
        );
      }

      if (command === "topmessages") {
        arr.sort(
          (a, b) =>
            b[1].stats.messages -
            a[1].stats.messages
        );
      }

      if (command === "topcommands") {
        arr.sort(
          (a, b) =>
            b[1].stats.commands -
            a[1].stats.commands
        );
      }

      const text =
        arr.slice(0, 10)
          .map(
            ([id, d], i) =>
              `**${i + 1}.** <@${id}>`
          )
          .join("\n") ||
        "Sin datos.";

      return message.reply({
        embeds: [
          embed(
            "🏆 TOP",
            text,
            0x2ecc71
          )
        ]
      });
    }

    if (
      [
        "guildstats",
        "serverlevel",
        "membersstats",
        "rolestats",
        "channelstats",
        "booststats",
        "botstats",
        "humanstats",
        "guildxp",
        "guildmoney"
      ].includes(command)
    ) {
      const users =
        Object.values(guild.users);

      const totalXP =
        users.reduce(
          (sum, u) =>
            sum + u.xp + u.level * 100,
          0
        );

      const totalMoney =
        users.reduce(
          (sum, u) =>
            sum + u.wallet + u.bank,
          0
        );

      return message.reply({
        embeds: [
          embed(
            "📊 ESTADÍSTICAS DEL SERVIDOR",
            `👥 Miembros: **${message.guild.memberCount}**\n` +
            `🎭 Roles: **${message.guild.roles.cache.size}**\n` +
            `📺 Canales: **${message.guild.channels.cache.size}**\n` +
            `🚀 Boosts: **${message.guild.premiumSubscriptionCount || 0}**\n` +
            `⭐ XP registrada: **${totalXP}**\n` +
            `💰 Economía registrada: **${money(totalMoney)}**`
          )
        ]
      });
    }

    // ========================================================
    // PERSONALIZACIÓN
    // ========================================================

    if (command === "setnickname") {
      if (!message.member.manageable) {
        return message.reply(
          "❌ No puedo cambiar tu apodo."
        );
      }

      const nick =
        args.join(" ").slice(0, 32);

      if (!nick) {
        return message.reply(
          "✏️ Escribe el nuevo apodo."
        );
      }

      try {
        await message.member.setNickname(nick);

        return message.reply(
          `✏️ Apodo cambiado a **${nick}**.`
        );
      } catch {
        return message.reply(
          "❌ No pude cambiar el apodo."
        );
      }
    }

    if (
      command === "setavatar" ||
      command === "profileview"
    ) {
      return message.reply({
        embeds: [
          embed(
            `👤 ${message.author.username}`,
            `Avatar: ${message.author.displayAvatarURL({ size: 1024 })}`
          )
        ]
      });
    }

    if (
      command === "setstatus" ||
      command === "theme" ||
      command === "language" ||
      command === "profilecolor" ||
      command === "profiletitle" ||
      command === "profileemoji" ||
      command === "mysettings" ||
      command === "preferences"
    ) {
      return message.reply(
        `⚙️ Esta opción está disponible como configuración personal de Madokami.`
      );
    }

    if (command === "prefix") {
      return message.reply(
        `🔧 El prefijo actual es \`${PREFIX}\`.`
      );
    }

    if (command === "banner") {
      return message.reply(
        `🖼️ Banner: ${message.author.bannerURL({ size: 1024 }) || "No tienes banner público."}`
      );
    }

    if (command === "serverbanner") {
      return message.reply(
        `🖼️ Banner del servidor: ${message.guild.bannerURL({ size: 1024 }) || "Este servidor no tiene banner."}`
      );
    }

    if (command === "rolelist") {
      return longReply(
        message,
        message.guild.roles.cache
          .sort(
            (a, b) => b.position - a.position
          )
          .map(r => `${r}`)
          .join("\n")
      );
    }

    if (command === "channellist") {
      return longReply(
        message,
        message.guild.channels.cache
          .map(c => `${c}`)
          .join("\n")
      );
    }

    if (command === "emojilist") {
      return longReply(
        message,
        message.guild.emojis.cache
          .map(e => `${e}`)
          .join(" ") ||
        "No hay emojis."
      );
    }

    if (command === "memberlist") {
      return message.reply(
        `👥 Actualmente hay **${message.guild.memberCount}** miembros.`
      );
    }

    if (command === "botlist") {
      const bots =
        message.guild.members.cache
          .filter(m => m.user.bot)
          .map(m => m.user.tag);

      return longReply(
        message,
        bots.join("\n") ||
        "No hay bots."
      );
    }

    if (command === "welcomeinfo") {
      const c =
        guild.config;

      return message.reply({
        embeds: [
          embed(
            "🌸 BIENVENIDA",
            `Estado: **${c.welcome ? "Activado" : "Desactivado"}**\n` +
            `Canal: ${c.welcomeChannel ? `<#${c.welcomeChannel}>` : "No configurado"}`
          )
        ]
      });
    }

    if (command === "rules") {
      return message.reply(
        "📜 Revisa las reglas fijadas o el canal de reglas de este servidor."
      );
    }

    if (command === "social") {
      return message.reply(
        "🌐 El servidor todavía no ha configurado sus redes sociales."
      );
    }

    if (command === "links") {
      return message.reply(
        "🔗 No hay enlaces públicos configurados."
      );
    }

    if (command === "support") {
      return message.reply(
        "🆘 Contacta con el equipo de administración de este servidor."
      );
    }

    if (command === "about") {
      return message.reply({
        embeds: [
          embed(
            "🌸 SOBRE MADOKAMI",
            "Madokami es un bot de Discord con economía, diversión, utilidades, estadísticas, personalización, logros y funciones de IA."
          )
        ]
      });
    }

    if (
      command === "commands" ||
      command === "menu"
    ) {
      return message.reply({
        embeds: [mainHelp()],
        components: [helpMenu()]
      });
    }

    // ========================================================
    // LOGROS
    // ========================================================

    if (
      command === "achievements" ||
      command === "progress"
    ) {
      const achievements = [];

      if (user.stats.commands >= 1)
        achievements.push("🤖 Primer comando");

      if (user.stats.messages >= 100)
        achievements.push("💬 100 mensajes");

      if (user.stats.commands >= 100)
        achievements.push("🤖 100 comandos");

      if (user.stats.earned >= 10000)
        achievements.push("💰 10.000 monedas ganadas");

      if (user.level >= 10)
        achievements.push("⭐ Nivel 10");

      if (user.level >= 25)
        achievements.push("⭐ Nivel 25");

      if (user.level >= 50)
        achievements.push("⭐ Nivel 50");

      if (!achievements.length) {
        achievements.push(
          "🌱 Todavía no tienes logros desbloqueados."
        );
      }

      return message.reply({
        embeds: [
          embed(
            "🏆 TUS LOGROS",
            achievements.join("\n")
          )
        ]
      });
    }

    if (
      [
        "achievementslist",
        "firstwork",
        "firstdaily",
        "richachievement",
        "levelachievement",
        "xpachievement",
        "messageachievement",
        "commandachievement",
        "socialachievement",
        "collector",
        "worker",
        "explorer",
        "fisher",
        "miner",
        "farmer",
        "helper",
        "active",
        "veteran",
        "millionaire",
        "level10",
        "level25",
        "level50",
        "messages100",
        "commands100",
        "xp1000",
        "money10000",
        "money100000",
        "ultimate"
      ].includes(command)
    ) {
      const checks = {
        firstwork:
          user.cooldowns.work !== undefined,

        firstdaily:
          user.cooldowns.daily !== undefined,

        richachievement:
          user.wallet + user.bank >= 10000,

        levelachievement:
          user.level >= 10,

        xpachievement:
          user.xp >= 1000,

        messageachievement:
          user.stats.messages >= 100,

        commandachievement:
          user.stats.commands >= 100,

        collector:
          user.inventory.length >= 4,

        worker:
          user.stats.earned >= 5000,

        explorer:
          user.cooldowns.treasure !== undefined,

        fisher:
          user.cooldowns.fish !== undefined,

        miner:
          user.cooldowns.mine !== undefined,

        farmer:
          user.cooldowns.farm !== undefined,

        active:
          user.stats.messages >= 500,

        veteran:
          user.level >= 25,

        millionaire:
          user.wallet + user.bank >= 1000000,

        level10:
          user.level >= 10,

        level25:
          user.level >= 25,

        level50:
          user.level >= 50,

        messages100:
          user.stats.messages >= 100,

        commands100:
          user.stats.commands >= 100,

        xp1000:
          user.xp >= 1000,

        money10000:
          user.wallet + user.bank >= 10000,

        money100000:
          user.wallet + user.bank >= 100000,

        ultimate:
          user.level >= 50 &&
          user.stats.messages >= 1000 &&
          user.stats.commands >= 500
      };

      if (command === "achievementslist") {
        return message.reply(
          "🏆 Logros: Primer trabajo • Daily • 10K • 100K • Nivel 10 • Nivel 25 • Nivel 50 • 100 mensajes • 100 comandos • Coleccionista • Veterano • Definitivo."
        );
      }

      if (
        checks[command] === true
      ) {
        return message.reply(
          `🏆 **${command}**\n\n✨ ¡Logro desbloqueado!`
        );
      }

      return message.reply(
        `🔒 **${command}**\n\nTodavía no lo has desbloqueado.`
      );
    }

    // ========================================================
    // ADMIN CHECK
    // ========================================================

    const adminCommands = [
      "ban",
      "unban",
      "kick",
      "mute",
      "unmute",
      "warn",
      "warnings",
      "clear",
      "lock",
      "unlock",
      "slowmode",
      "antilink",
      "antispam",
      "whitelist",
      "whitelistadd",
      "whitelistremove",
      "whitelistlist",
      "log",
      "welcome",
      "autorrespuesta",
      "autorrespuestaoff",
      "reaccion",
      "reaccionoff",
      "say",
      "announce",
      "embed"
    ];

    if (
      adminCommands.includes(command) &&
      !admin(message.member)
    ) {
      return message.reply(
        "🛡️ Este comando es solo para administradores."
      );
    }

    // ========================================================
    // BAN
    // ========================================================

    if (command === "ban") {
      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "🔨 Menciona al usuario."
        );
      }

      try {
        await target.ban({
          reason:
            `Madokami • ${message.author.tag}`
        });

        await message.reply(
          `🔨 **${target.user.tag}** fue baneado.`
        );

        await log(
          message.guild,
          "🔨 BAN",
          `${target.user.tag} fue baneado por ${message.author.tag}.`
        );
      } catch {
        return message.reply(
          "❌ No pude banear a ese usuario."
        );
      }
    }

    // ========================================================
    // UNBAN
    // ========================================================

    if (command === "unban") {
      const id = args[0];

      if (!id) {
        return message.reply(
          "🔓 Usa `m!unban ID`."
        );
      }

      try {
        await message.guild.members.unban(id);

        return message.reply(
          `🔓 Usuario \`${id}\` desbaneado.`
        );
      } catch {
        return message.reply(
          "❌ No pude desbanear ese usuario."
        );
      }
    }

    // ========================================================
    // KICK
    // ========================================================

    if (command === "kick") {
      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "👢 Menciona al usuario."
        );
      }

      try {
        await target.kick(
          `Madokami • ${message.author.tag}`
        );

        return message.reply(
          `👢 **${target.user.tag}** expulsado.`
        );
      } catch {
        return message.reply(
          "❌ No pude expulsar al usuario."
        );
      }
    }

    // ========================================================
    // MUTE
    // ========================================================

    if (command === "mute") {
      const target =
        message.mentions.members.first();

      const minutes =
        parseInt(args[1]) || 10;

      if (!target) {
        return message.reply(
          "🔇 Menciona al usuario."
        );
      }

      try {
        await target.timeout(
          minutes * 60 * 1000,
          `Madokami • ${message.author.tag}`
        );

        return message.reply(
          `🔇 ${target} silenciado durante **${minutes} minutos**.`
        );
      } catch {
        return message.reply(
          "❌ No pude silenciar al usuario."
        );
      }
    }

    // ========================================================
    // UNMUTE
    // ========================================================

    if (command === "unmute") {
      const target =
        message.mentions.members.first();

      if (!target) {
        return message.reply(
          "🔊 Menciona al usuario."
        );
      }

      try {
        await target.timeout(
          null,
          `Madokami • ${message.author.tag}`
        );

        return message.reply(
          `🔊 ${target} ya puede hablar.`
        );
      } catch {
        return message.reply(
          "❌ No pude quitar el silencio."
        );
      }
    }

    // ========================================================
    // WARN
    // ========================================================

    if (command === "warn") {
      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          "⚠️ Menciona al usuario."
        );
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón";

      const warnings =
        guild.warnings;

      if (!warnings[target.id]) {
        warnings[target.id] = [];
      }

      warnings[target.id].push({
        reason,
        moderator: message.author.id,
        date: Date.now()
      });

      saveDB();

      return message.reply(
        `⚠️ ${target} recibió una advertencia.\nRazón: **${reason}**`
      );
    }

    // ========================================================
    // WARNINGS
    // ========================================================

    if (command === "warnings") {
      const target =
        message.mentions.users.first() ||
        message.author;

      const list =
        guild.warnings[target.id] || [];

      return message.reply(
        `⚠️ ${target} tiene **${list.length}** advertencias.`
      );
    }

    // ========================================================
    // CLEAR
    // ========================================================

    if (command === "clear") {
      const amount =
        parseInt(args[0]);

      if (
        !amount ||
        amount < 1 ||
        amount > 100
      ) {
        return message.reply(
          "🧹 Usa una cantidad entre 1 y 100."
        );
      }

      try {
        const deleted =
          await message.channel.bulkDelete(
            amount,
            true
          );

        await log(
          message.guild,
          "🧹 CLEAR",
          `${message.author.tag} eliminó ${deleted.size} mensajes.`
        );

        return message.channel.send(
          `🧹 Eliminados **${deleted.size}** mensajes.`
        ).then(msg => {
          setTimeout(
            () => msg.delete().catch(() => {}),
            4000
          );
        });
      } catch {
        return message.reply(
          "❌ No pude eliminar los mensajes."
        );
      }
    }

    // ========================================================
    // LOCK
    // ========================================================

    if (command === "lock") {
      try {
        await message.channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          {
            SendMessages: false
          }
        );

        return message.reply(
          "🔒 Canal bloqueado."
        );
      } catch {
        return message.reply(
          "❌ No pude bloquear el canal."
        );
      }
    }

    // ========================================================
    // UNLOCK
    // ========================================================

    if (command === "unlock") {
      try {
        await message.channel.permissionOverwrites.edit(
          message.guild.roles.everyone,
          {
            SendMessages: null
          }
        );

        return message.reply(
          "🔓 Canal desbloqueado."
        );
      } catch {
        return message.reply(
          "❌ No pude desbloquear el canal."
        );
      }
    }

    // ========================================================
    // SLOWMODE
    // ========================================================

    if (command === "slowmode") {
      const seconds =
        parseInt(args[0]) || 0;

      if (
        seconds < 0 ||
        seconds > 21600
      ) {
        return message.reply(
          "⏱️ Usa entre 0 y 21600 segundos."
        );
      }

      try {
        await message.channel.setRateLimitPerUser(
          seconds
        );

        return message.reply(
          `⏱️ Slowmode establecido en **${seconds}s**.`
        );
      } catch {
        return message.reply(
          "❌ No pude cambiar el slowmode."
        );
      }
    }

    // ========================================================
    // ANTILINK
    // ========================================================

    if (command === "antilink") {
      const value =
        args[0]?.toLowerCase();

      if (
        value !== "on" &&
        value !== "off"
      ) {
        return message.reply(
          "🔗 Usa `m!antilink on` o `m!antilink off`."
        );
      }

      guild.config.antiLink =
        value === "on";

      saveDB();

      return message.reply(
        `🔗 Anti-link: **${value === "on" ? "ACTIVADO" : "DESACTIVADO"}**`
      );
    }

    // ========================================================
    // ANTISPAM
    // ========================================================

    if (command === "antispam") {
      const value =
        args[0]?.toLowerCase();

      if (
        value !== "on" &&
        value !== "off"
      ) {
        return message.reply(
          "🚫 Usa `m!antispam on` o `m!antispam off`."
        );
      }

      guild.config.antiSpam =
        value === "on";

      saveDB();

      return message.reply(
        `🚫 Anti-spam: **${value === "on" ? "ACTIVADO" : "DESACTIVADO"}**`
      );
    }

    // ========================================================
    // WHITELIST
    // ========================================================

    if (command === "whitelist") {
      return message.reply(
        "🛡️ Usa:\n`m!whitelistadd @usuario`\n`m!whitelistremove @usuario`\n`m!whitelistlist`"
      );
    }

    if (command === "whitelistadd") {
      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          "🛡️ Menciona al usuario."
        );
      }

      if (
        !guild.config.whitelist.includes(
          target.id
        )
      ) {
        guild.config.whitelist.push(
          target.id
        );
      }

      saveDB();

      return message.reply(
        `🛡️ ${target} añadido a la whitelist.\nAhora puede enviar enlaces y mensajes rápidos sin que anti-link/anti-spam actúen sobre él.`
      );
    }

    if (command === "whitelistremove") {
      const target =
        message.mentions.users.first();

      if (!target) {
        return message.reply(
          "🛡️ Menciona al usuario."
        );
      }

      guild.config.whitelist =
        guild.config.whitelist.filter(
          id => id !== target.id
        );

      saveDB();

      return message.reply(
        `🛡️ ${target} eliminado de la whitelist.`
      );
    }

    if (command === "whitelistlist") {
      const list =
        guild.config.whitelist;

      return message.reply({
        embeds: [
          embed(
            "🛡️ WHITELIST",
            list.length
              ? list
                  .map(id => `• <@${id}>`)
                  .join("\n")
              : "No hay usuarios en la whitelist."
          )
        ]
      });
    }

    // ========================================================
    // LOG
    // ========================================================

    if (command === "log") {
      const value =
        args[0]?.toLowerCase();

      if (value === "off") {
        guild.config.logChannel = null;
        saveDB();

        return message.reply(
          "📋 Logs desactivados."
        );
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        return message.reply(
          "📋 Usa `m!log #canal` o `m!log off`."
        );
      }

      guild.config.logChannel =
        channel.id;

      saveDB();

      return message.reply(
        `📋 Logs configurados en ${channel}.`
      );
    }

    // ========================================================
    // WELCOME
    // ========================================================

    if (command === "welcome") {
      const mode =
        args[0]?.toLowerCase();

      if (mode === "off") {
        guild.config.welcome = false;
        saveDB();

        return message.reply(
          "🌸 Bienvenida desactivada."
        );
      }

      const channel =
        message.mentions.channels.first();

      if (!channel) {
        return message.reply(
          "🌸 Usa `m!welcome #canal` o `m!welcome off`."
        );
      }

      guild.config.welcome = true;
      guild.config.welcomeChannel =
        channel.id;

      saveDB();

      return message.reply(
        `🌸 Bienvenida configurada en ${channel}.`
      );
    }

    // ========================================================
    // AUTORESPUESTAS
    // ========================================================

    if (command === "autorrespuesta") {
      const trigger =
        args.shift();

      const response =
        args.join(" ");

      if (!trigger || !response) {
        return message.reply(
          "🤖 Usa `m!autorrespuesta palabra respuesta`."
        );
      }

      guild.config.autoResponses[
        trigger.toLowerCase()
      ] = response;

      saveDB();

      return message.reply(
        `🤖 Autorespuesta creada para **${trigger}**.`
      );
    }

    if (command === "autorrespuestaoff") {
      const trigger =
        args[0]?.toLowerCase();

      if (!trigger) {
        return message.reply(
          "🤖 Indica la palabra."
        );
      }

      delete guild.config.autoResponses[
        trigger
      ];

      saveDB();

      return message.reply(
        `🤖 Autorespuesta **${trigger}** eliminada.`
      );
    }

    // ========================================================
    // REACCIONES
    // ========================================================

    if (command === "reaccion") {
      const trigger =
        args.shift();

      const emoji =
        args.shift();

      if (!trigger || !emoji) {
        return message.reply(
          "😂 Usa `m!reaccion palabra emoji`."
        );
      }

      guild.config.autoReactions[
        trigger.toLowerCase()
      ] = emoji;

      saveDB();

      return message.reply(
        `😂 Reacción automática creada para **${trigger}**.`
      );
    }

    if (command === "reaccionoff") {
      const trigger =
        args[0]?.toLowerCase();

      if (!trigger) {
        return message.reply(
          "😂 Indica la palabra."
        );
      }

      delete guild.config.autoReactions[
        trigger
      ];

      saveDB();

      return message.reply(
        `😂 Reacción automática **${trigger}** eliminada.`
      );
    }

    // ========================================================
    // SAY
    // ========================================================

    if (command === "say") {
      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "📢 Escribe el mensaje."
        );
      }

      try {
        await message.delete();
      } catch {}

      return message.channel.send({
        content: text,
        allowedMentions: {
          parse: ["users", "roles"]
        }
      });
    }

    // ========================================================
    // ANNOUNCE
    // ========================================================

    if (command === "announce") {
      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "📢 Escribe el anuncio."
        );
      }

      try {
        await message.delete();
      } catch {}

      return message.channel.send({
        embeds: [
          embed(
            "📢 ANUNCIO",
            text,
            0xe74c3c
          )
        ]
      });
    }

    // ========================================================
    // EMBED
    // ========================================================

    if (command === "embed") {
      const text =
        args.join(" ");

      if (!text) {
        return message.reply(
          "📦 Escribe el texto del embed."
        );
      }

      try {
        await message.delete();
      } catch {}

      return message.channel.send({
        embeds: [
          embed(
            "🌸 Madokami",
            text
          )
        ]
      });
    }

    // ========================================================
    // COMANDO DESCONOCIDO
    // ========================================================

    return message.reply(
      `❌ No conozco el comando \`${PREFIX}${command}\`.\nUsa \`${PREFIX}help\` para ver los comandos.`
    );
  }
);

// ============================================================
// ERROR HANDLING
// ============================================================

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "Unhandled Rejection:",
      error
    );
  }
);

process.on(
  "uncaughtException",
  error => {
    console.error(
      "Uncaught Exception:",
      error
    );
  }
);

// ============================================================
// LOAD DATABASE
// ============================================================

loadDB();

// ============================================================
// RENDER WEB SERVER
// ============================================================

http
  .createServer(
    (req, res) => {
      res.writeHead(200, {
        "Content-Type":
          "text/plain; charset=utf-8"
      });

      res.end(
        "🌸 Madokami está conectado correctamente."
      );
    }
  )
  .listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(
        `🌐 Servidor HTTP en puerto ${PORT}`
      );
    }
  );

// ============================================================
// LOGIN
// ============================================================

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ Falta DISCORD_TOKEN en las variables de entorno."
  );
  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
