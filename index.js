const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

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
    GatewayIntentBits.GuildPresences
  ]
});

/* =========================
   RENDER
========================= */

const app = express();

app.get("/", (_, res) => {
  res.send("🌸 Madokami está conectada correctamente.");
});

app.get("/health", (_, res) => {
  res.json({
    online: true,
    bot: "Madokami"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Web activa en ${PORT}`);
});

/* =========================
   DATABASE
========================= */

let db = {
  guilds: {},
  users: {}
};

try {
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
} catch {
  db = {
    guilds: {},
    users: {}
  };
}

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch {}
}

function guildData(id) {
  if (!db.guilds[id]) {
    db.guilds[id] = {
      logChannel: null,
      antiLink: false,
      antiSpam: false,
      whitelist: [],

      welcome: {
        enabled: false,
        channel: null,
        message: "🌸 Bienvenido {user} a **{server}**."
      },

      goodbye: {
        enabled: false,
        channel: null,
        message: "👋 **{user}** salió de **{server}**."
      },

      autoRole: null,
      autoReplies: [],
      autoReactions: []
    };
  }

  return db.guilds[id];
}

function userData(guildId, userId) {
  if (!db.users[guildId]) {
    db.users[guildId] = {};
  }

  if (!db.users[guildId][userId]) {
    db.users[guildId][userId] = {
      balance: 1000,
      bank: 0,
      xp: 0,
      level: 1,
      rep: 0,
      warnings: [],
      inventory: [],
      bio: "",
      afk: false,
      afkText: "",
      birthday: "",
      notes: [],
      cooldowns: {}
    };
  }

  return db.users[guildId][userId];
}

/* =========================
   HELPERS
========================= */

const COLORS = {
  pink: 0xff78c8,
  purple: 0xb57cff,
  blue: 0x62a8ff,
  green: 0x65d68a,
  red: 0xff5f6d,
  gold: 0xffd166,
  cyan: 0x61e7e7
};

function embed(title, description, color = COLORS.pink) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`🌸 ${title}`)
    .setDescription(description)
    .setFooter({
      text: "Madokami • m!help"
    })
    .setTimestamp();
}

async function reply(message, title, description, color = COLORS.pink) {
  return message.reply({
    embeds: [
      embed(title, description, color)
    ]
  });
}

function isAdmin(message) {
  return message.member?.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function isModerator(message) {
  return (
    isAdmin(message) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.ManageMessages
    ) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.ModerateMembers
    )
  );
}

function targetMember(message, arg) {
  if (!arg) return null;

  const id = arg.replace(/[<@!>]/g, "");

  return (
    message.mentions.members.first() ||
    message.guild.members.cache.get(id) ||
    null
  );
}

function targetRole(guild, arg) {
  if (!arg) return null;

  const id = arg.replace(/[<@&>]/g, "");

  return (
    guild.roles.cache.get(id) ||
    guild.roles.cache.find(
      r =>
        r.name.toLowerCase() ===
        arg.toLowerCase()
    )
  );
}

function cooldown(user, name, time) {
  const now = Date.now();
  const last = user.cooldowns[name] || 0;

  if (now - last < time) {
    return Math.ceil(
      (time - (now - last)) / 1000
    );
  }

  user.cooldowns[name] = now;
  save();

  return 0;
}

async function sendLog(
  guild,
  title,
  description,
  color = COLORS.purple
) {
  const config = guildData(guild.id);

  if (!config.logChannel) return;

  const channel =
    guild.channels.cache.get(config.logChannel);

  if (!channel?.isTextBased()) return;

  await channel.send({
    embeds: [
      embed(
        `📋 ${title}`,
        description,
        color
      )
    ]
  }).catch(() => {});
}

/* =========================
   HELP CATEGORIES
========================= */

const CATEGORIES = {

  utility: {
    name: "🔧 Utilidad",
    color: COLORS.blue,
    commands: [

      ["ping", "Ver latencia"],
      ["uptime", "Ver tiempo activo"],
      ["botinfo", "Información de Madokami"],
      ["serverinfo", "Información del servidor"],
      ["userinfo", "Información de usuario"],
      ["avatar", "Ver avatar"],
      ["servericon", "Ver icono del servidor"],
      ["roles", "Lista de roles"],
      ["channels", "Lista de canales"],
      ["membercount", "Cantidad de miembros"],

      ["channel", "Información de canal"],
      ["role", "Información de rol"],
      ["emoji", "Información de emoji"],
      ["calc", "Calculadora"],
      ["choose", "Elegir una opción"],
      ["random", "Número aleatorio"],
      ["reverse", "Invertir texto"],
      ["uppercase", "Convertir a mayúsculas"],
      ["lowercase", "Convertir a minúsculas"],
      ["poll", "Crear encuesta"]

    ]
  },

  economy: {
    name: "💰 Economía",
    color: COLORS.gold,
    commands: [
      ["balance", "Ver saldo"],
      ["work", "Trabajar"],
      ["daily", "Recompensa diaria"],
      ["weekly", "Recompensa semanal"],
      ["deposit", "Depositar dinero"],
      ["withdraw", "Retirar dinero"],
      ["pay", "Pagar"],
      ["give", "Dar dinero"],
      ["crime", "Crime"],
      ["risk", "Risk"],
      ["shop", "Tienda"],
      ["buy", "Comprar"],
      ["sell", "Vender"],
      ["inventory", "Inventario"],
      ["wallet", "Cartera"],
      ["bank", "Banco"],
      ["leaderboard", "Ranking"],
      ["earn", "Formas de ganar"],
      ["bonus", "Bono"],
      ["economy", "Información económica"]
    ]
  },

  moderation: {
    name: "🛡️ Moderación",
    color: COLORS.red,
    commands: [
      ["ban", "Banear"],
      ["unban", "Desbanear"],
      ["kick", "Expulsar"],
      ["mute", "Silenciar"],
      ["unmute", "Quitar silencio"],
      ["timeout", "Timeout"],
      ["untimeout", "Quitar timeout"],
      ["warn", "Advertir"],
      ["unwarn", "Quitar advertencia"],
      ["warnings", "Ver advertencias"],
      ["clear", "Eliminar mensajes"],
      ["purge", "Limpiar mensajes"],
      ["slowmode", "Activar slowmode"],
      ["lock", "Bloquear canal"],
      ["unlock", "Desbloquear canal"],
      ["nick", "Cambiar apodo"],
      ["resetnick", "Restablecer apodo"],
      ["roleadd", "Dar rol"],
      ["roleremove", "Quitar rol"],
      ["roleinfo", "Información de rol"]
    ]
  },

  fun: {
    name: "🎮 Diversión",
    color: COLORS.purple,
    commands: [
      ["8ball", "Pregunta a la bola 8"],
      ["coinflip", "Cara o cruz"],
      ["dice", "Tirar dado"],
      ["roll", "Tirar dados"],
      ["rps", "Piedra, papel o tijera"],
      ["trivia", "Trivia"],
      ["guess", "Adivina el número"],
      ["joke", "Chiste"],
      ["compliment", "Cumplido"],
      ["roast", "Broma"],
      ["fact", "Dato curioso"],
      ["fortune", "Fortuna"],
      ["quote", "Frase"],
      ["riddle", "Acertijo"],
      ["wyr", "¿Qué prefieres?"],
      ["ascii", "Texto ASCII"],
      ["mock", "Texto burlón"],
      ["reversewords", "Invertir palabras"],
      ["shuffle", "Mezclar texto"],
      ["funfact", "Dato divertido"]
    ]
  },

  social: {
    name: "👥 Social",
    color: COLORS.green,
    commands: [
      ["profile", "Ver perfil"],
      ["rep", "Dar reputación"],
      ["bio", "Ver biografía"],
      ["setbio", "Cambiar biografía"],
      ["level", "Ver nivel"],
      ["xp", "Ver XP"],
      ["rank", "Ver rango"],
      ["top", "Ranking XP"],
      ["afk", "Activar AFK"],
      ["setafk", "Configurar AFK"],
      ["birthday", "Ver cumpleaños"],
      ["setbirthday", "Guardar cumpleaños"],
      ["notes", "Ver notas"],
      ["note", "Añadir nota"],
      ["clearnotes", "Borrar notas"],
      ["members", "Ver miembros"],
      ["online", "Ver miembros online"],
      ["myroles", "Ver mis roles"],
      ["myid", "Ver mi ID"],
      ["social", "Información social"]
    ]
  },

  rewards: {
    name: "🎁 Recompensas",
    color: COLORS.gold,
    commands: [
      ["reward", "Recompensa"],
      ["rewards", "Ver recompensas"],
      ["monthly", "Recompensa mensual"],
      ["streak", "Racha"],
      ["claim", "Reclamar"],
      ["bonus", "Bono"],
      ["gift", "Regalo"],
      ["gifts", "Regalos"],
      ["achievement", "Logro"],
      ["achievements", "Logros"],
      ["milestone", "Hito"],
      ["milestones", "Hitos"],
      ["levelup", "Subida de nivel"],
      ["rankcard", "Tarjeta de rango"],
      ["quest", "Misión"],
      ["quests", "Misiones"],
      ["mission", "Misión"],
      ["missions", "Misiones"],
      ["prize", "Premio"],
      ["trophy", "Trofeo"]
    ]
  },

  stats: {
    name: "📊 Estadísticas",
    color: COLORS.cyan,
    commands: [
      ["stats", "Estadísticas"],
      ["mystats", "Mis estadísticas"],
      ["serverstats", "Estadísticas del servidor"],
      ["memberstats", "Estadísticas de miembro"],
      ["messages", "Mensajes"],
      ["messagecount", "Cantidad de mensajes"],
      ["activity", "Actividad"],
      ["levels", "Niveles"],
      ["levelstats", "Estadísticas de nivel"],
      ["xpstats", "Estadísticas XP"],
      ["rankstats", "Estadísticas de rango"],
      ["leaderboard", "Ranking"],
      ["topcoins", "Top monedas"],
      ["topxp", "Top XP"],
      ["toprep", "Top reputación"],
      ["voice", "Estadísticas de voz"],
      ["joins", "Entradas"],
      ["leaves", "Salidas"],
      ["rolesstats", "Estadísticas de roles"],
      ["botstats", "Estadísticas del bot"]
    ]
  },

  customization: {
    name: "🎨 Personalización",
    color: COLORS.pink,
    commands: [
      ["color", "Color"],
      ["setcolor", "Configurar color"],
      ["welcome", "Bienvenida"],
      ["setwelcome", "Configurar bienvenida"],
      ["goodbye", "Despedida"],
      ["setgoodbye", "Configurar despedida"],
      ["autorole", "Rol automático"],
      ["setautorole", "Configurar autorol"],
      ["welcomechannel", "Canal de bienvenida"],
      ["goodbyechannel", "Canal de despedida"],
      ["log", "Canal de logs"],
      ["theme", "Tema"],
      ["nickname", "Apodo"],
      ["setnickname", "Configurar apodo"],
      ["resetnickname", "Restablecer apodo"],
      ["servername", "Nombre del servidor"],
      ["setservername", "Cambiar nombre"],
      ["description", "Descripción"],
      ["setdescription", "Cambiar descripción"]
    ]
  },

  achievements: {
    name: "🏆 Logros",
    color: COLORS.gold,
    commands: [
      ["achievements", "Ver logros"],
      ["achievement", "Ver logro"],
      ["ach", "Logro"],
      ["progress", "Progreso"],
      ["milestone", "Hitos"],
      ["badges", "Insignias"],
      ["badge", "Insignia"],
      ["badgelist", "Lista de insignias"],
      ["titles", "Títulos"],
      ["title", "Título"],
      ["collection", "Colección"],
      ["collector", "Coleccionista"],
      ["mastery", "Maestría"],
      ["masteries", "Maestrías"],
      ["complete", "Completados"],
      ["completed", "Logros completados"],
      ["unlocked", "Desbloqueados"],
      ["locked", "Bloqueados"],
      ["rare", "Logros raros"],
      ["legendary", "Logros legendarios"]
    ]
  },

  games: {
    name: "🎲 Minijuegos",
    color: COLORS.purple,
    commands: [
      ["dicegame", "Juego de dados"],
      ["coinflip", "Cara o cruz"],
      ["rps", "Piedra papel tijera"],
      ["guess", "Adivina"],
      ["number", "Adivina número"],
      ["higher", "Mayor"],
      ["lower", "Menor"],
      ["trivia", "Trivia"],
      ["quiz", "Quiz"],
      ["math", "Matemáticas"],
      ["riddle", "Acertijo"],
      ["word", "Palabra"],
      ["scramble", "Palabra mezclada"],
      ["anagram", "Anagrama"],
      ["memory", "Memoria"],
      ["sequence", "Secuencia"],
      ["reaction", "Reacción"],
      ["randomgame", "Juego aleatorio"],
      ["challenge", "Desafío"],
      ["gamehelp", "Ayuda de juegos"]
    ]
  },

  madokami: {
    name: "🌸 Madokami",
    color: COLORS.pink,
    commands: [
      ["madokami", "Información de Madokami"],
      ["about", "Sobre Madokami"],
      ["info", "Información"],
      ["version", "Versión"],
      ["credits", "Créditos"],
      ["status", "Estado"],
      ["features", "Funciones"],
      ["commands", "Comandos"],
      ["privacy", "Privacidad"],
      ["terms", "Términos"],
      ["support", "Soporte"],
      ["invite", "Invitar"],
      ["report", "Reportar"],
      ["suggest", "Sugerencia"],
      ["feedback", "Feedback"],
      ["bug", "Reportar bug"],
      ["bugs", "Bugs"],
      ["changelog", "Cambios"],
      ["updates", "Actualizaciones"],
      ["faq", "Preguntas frecuentes"]
    ]
  },

  information: {
    name: "📦 Información",
    color: COLORS.blue,
    commands: [
      ["server", "Servidor"],
      ["serverinfo", "Información del servidor"],
      ["userinfo", "Información de usuario"],
      ["members", "Miembros"],
      ["roles", "Roles"],
      ["channels", "Canales"],
      ["emojis", "Emojis"],
      ["stickers", "Stickers"],
      ["botinfo", "Bot"],
      ["guildid", "ID del servidor"],
      ["owner", "Dueño"],
      ["created", "Fecha de creación"],
      ["joined", "Fecha de entrada"],
      ["permissions", "Permisos"],
      ["roleinfo", "Información de rol"],
      ["channelinfo", "Información de canal"],
      ["rules", "Reglas"],
      ["features", "Funciones"],
      ["settings", "Configuración"],
      ["prefixinfo", "Prefijo"]
    ]
  }
};

/* =========================
   HELP
========================= */

function homeEmbed() {
  return embed(
    "Madokami • Inicio",
    [
      "✨ **Centro de ayuda**",
      "",
      "Selecciona una categoría en el menú de abajo.",
      "",
      "🌸 **Categorías disponibles**",
      "",
      "💰 Economía",
      "🛡️ Moderación",
      "🔧 Utilidad",
      "🎮 Diversión",
      "👥 Social",
      "🎁 Recompensas",
      "📊 Estadísticas",
      "🎨 Personalización",
      "🏆 Logros",
      "🎲 Minijuegos",
      "🌸 Madokami",
      "📦 Información",
      "",
      "⚙️ Para administración usa `m!helpad`."
    ].join("\n")
  );
}

function helpMenu() {
  const options = Object.entries(CATEGORIES).map(
    ([key, category]) => ({
      label: category.name.replace(/^.\s/, ""),
      value: key,
      emoji: category.name[0]
    })
  );

  const rows = [];

  for (let i = 0; i < options.length; i += 5) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("madokami_category")
          .setPlaceholder("🌸 Selecciona una categoría")
          .addOptions(options.slice(i, i + 5))
      )
    );
  }

  return rows;
}

function categoryEmbed(key, page = 1) {
  const category = CATEGORIES[key];

  if (!category) return homeEmbed();

  const start = (page - 1) * 10;
  const commands = category.commands.slice(
    start,
    start + 10
  );

  return embed(
    `${category.name} • Página ${page}/2`,
    commands.map(
      ([command, description], i) =>
        `**${start + i + 1}. \`${PREFIX}${command}\`** — ${description}`
    ).join("\n") +
    "\n\n🌸 Usa los botones para cambiar de página."
  );
}

function categoryButtons(key, page) {
  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId(`madokami_prev:${key}:${page}`)
      .setLabel("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),

    new ButtonBuilder()
      .setCustomId(`madokami_home:${key}:1`)
      .setLabel("🌸 Inicio")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(`madokami_next:${key}:${page}`)
      .setLabel("▶️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 2)
  );
}

async function showHelp(message) {
  return message.reply({
    embeds: [homeEmbed()],
    components: helpMenu()
  });
}

/* =========================
   ADMIN HELP
========================= */

const ADMIN_COMMANDS = [
  "setup",
  "log",
  "antilink",
  "antispam",
  "whitelist",
  "welcome",
  "welcomechannel",
  "goodbye",
  "goodbyechannel",
  "autorole",
  "say",
  "announce",
  "autoreplyadd",
  "autoreplydel",
  "autoreplylist",
  "autoreactadd",
  "autoreactdel",
  "autoreactlist",
  "reactionrole",
  "settings",
  "security",
  "clearlogs",
  "adminstats",
  "reloadconfig"
];

function adminEmbed(page = 1) {
  const start = (page - 1) * 20;

  return embed(
    `👑 Administración • Página ${page}/2`,
    ADMIN_COMMANDS.slice(start, start + 20)
      .map(
        (x, i) =>
          `**${start + i + 1}. \`${PREFIX}${x}\`**`
      )
      .join("\n"),
    COLORS.purple
  );
}

/* =========================
   COMMANDS
========================= */

async function execute(message, command, args, raw) {

  const guild = message.guild;
  const config = guildData(guild.id);
  const user = userData(guild.id, message.author.id);

  /* HELP */

  if (command === "help") {
    return showHelp(message);
  }

  if (command === "helpad") {

    if (!isAdmin(message)) {
      return reply(
        message,
        "🔒 Acceso denegado",
        "Solo los administradores pueden usar `m!helpad`.",
        COLORS.red
      );
    }

    return message.reply({
      embeds: [adminEmbed(1)],
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId("admin_prev")
            .setLabel("◀️")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),

          new ButtonBuilder()
            .setCustomId("admin_next")
            .setLabel("▶️")
            .setStyle(ButtonStyle.Primary)
        )
      ]
    });
  }

  /* PING */

  if (
    command === "ping" ||
    command === "botping"
  ) {
    return reply(
      message,
      "🏓 Pong!",
      `Latencia: **${client.ws.ping}ms**`,
      COLORS.green
    );
  }

  /* UPTIME */

  if (
    command === "uptime" ||
    command === "uptimeinfo"
  ) {

    const total = Math.floor(process.uptime());

    const days = Math.floor(total / 86400);
    const hours = Math.floor(total / 3600) % 24;
    const minutes = Math.floor(total / 60) % 60;
    const seconds = total % 60;

    return reply(
      message,
      "⏱️ Uptime",
      `**${days}d ${hours}h ${minutes}m ${seconds}s**`,
      COLORS.blue
    );
  }

  /* BOT INFO */

  if (
    command === "botinfo" ||
    command === "madokami" ||
    command === "about"
  ) {
    return reply(
      message,
      "🌸 Madokami",
      `🤖 Nombre: **Madokami**
📌 Prefijo: \`${PREFIX}\`
⚙️ Discord.js: **v14**
🏠 Servidores: **${client.guilds.cache.size}**
👥 Usuarios: **${client.guilds.cache.reduce((a,g)=>a+g.memberCount,0).toLocaleString()}**
📶 Ping: **${client.ws.ping}ms**`
    );
  }

  /* SERVER INFO */

  if (
    command === "serverinfo" ||
    command === "server"
  ) {
    return reply(
      message,
      "🏠 Información del servidor",
      `**${guild.name}**

👥 Miembros: **${guild.memberCount}**
🎭 Roles: **${guild.roles.cache.size}**
📁 Canales: **${guild.channels.cache.size}**
😀 Emojis: **${guild.emojis.cache.size}**
🆔 ID: \`${guild.id}\``
    );
  }

  /* USER INFO */

  if (
    command === "userinfo" ||
    command === "userinfo2" ||
    command === "profile"
  ) {

    const target =
      targetMember(message, args[0]) ||
      message.member;

    const data =
      userData(guild.id, target.id);

    return reply(
      message,
      "👤 Información de usuario",
      `👤 Usuario: ${target}
🆔 ID: \`${target.id}\`
⭐ Nivel: **${data.level}**
✨ XP: **${data.xp}**
👍 Reputación: **${data.rep}**
⚠️ Advertencias: **${data.warnings.length}**
📅 Entrada: <t:${Math.floor(target.joinedTimestamp / 1000)}:F>`
    );
  }

  /* AVATAR */

  if (command === "avatar") {

    const target =
      targetMember(message, args[0]) ||
      message.member;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.pink)
          .setTitle(`🖼️ Avatar de ${target.user.username}`)
          .setImage(
            target.user.displayAvatarURL({
              size: 1024,
              extension: "png"
            })
          )
      ]
    });
  }

  /* SERVER ICON */

  if (
    command === "servericon"
  ) {

    if (!guild.iconURL()) {
      return reply(
        message,
        "🖼️ Icono",
        "Este servidor no tiene icono.",
        COLORS.red
      );
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.pink)
          .setTitle(`🖼️ ${guild.name}`)
          .setImage(
            guild.iconURL({
              size: 1024
            })
          )
      ]
    });
  }

  /* MEMBER COUNT */

  if (
    command === "membercount" ||
    command === "members"
  ) {
    return reply(
      message,
      "👥 Miembros",
      `Este servidor tiene **${guild.memberCount} miembros**.`
    );
  }

  /* ROLES */

  if (command === "roles") {

    const roles =
      guild.roles.cache
        .filter(r => r.id !== guild.id)
        .sort((a,b) => b.position-a.position)
        .map(r => `<@&${r.id}>`)
        .slice(0, 40);

    return reply(
      message,
      "🎭 Roles",
      roles.join("\n") || "No hay roles."
    );
  }

  /* CHANNELS */

  if (command === "channels") {

    const channels =
      guild.channels.cache
        .filter(c => c.isTextBased())
        .map(c => `#${c.name}`)
        .slice(0, 50);

    return reply(
      message,
      "📁 Canales",
      channels.join("\n") || "No hay canales."
    );
  }

  /* CALCULATOR */

  if (command === "calc") {

    if (!raw) {
      return reply(
        message,
        "🧮 Calculadora",
        `Uso: \`${PREFIX}calc 10 + 5 * 2\``
      );
    }

    if (!/^[0-9+\-*/().% ]+$/.test(raw)) {
      return reply(
        message,
        "🧮 Calculadora",
        "Solo se permiten operaciones matemáticas básicas.",
        COLORS.red
      );
    }

    try {
      const result = Function(
        `"use strict"; return (${raw})`
      )();

      return reply(
        message,
        "🧮 Calculadora",
        `Resultado: **${result}**`,
        COLORS.green
      );
    } catch {
      return reply(
        message,
        "🧮 Calculadora",
        "Operación inválida.",
        COLORS.red
      );
    }
  }

  /* TEXT COMMANDS */

  if (command === "reverse") {
    return reply(
      message,
      "🔄 Reverse",
      raw.split("").reverse().join("")
    );
  }

  if (command === "uppercase") {
    return reply(
      message,
      "🔠 Mayúsculas",
      raw.toUpperCase()
    );
  }

  if (command === "lowercase") {
    return reply(
      message,
      "🔡 Minúsculas",
      raw.toLowerCase()
    );
  }

  if (command === "length") {
    return reply(
      message,
      "📏 Longitud",
      `Caracteres: **${raw.length}**`
    );
  }

  if (command === "wordcount") {
    return reply(
      message,
      "📝 Palabras",
      `Palabras: **${raw.trim() ? raw.trim().split(/\s+/).length : 0}**`
    );
  }

  if (command === "choose") {

    const choices = raw
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);

    if (!choices.length) {
      return reply(
        message,
        "🎯 Choose",
        `Uso: \`${PREFIX}choose pizza | hamburguesa | tacos\``
      );
    }

    return reply(
      message,
      "🎯 Elección",
      `Elegí: **${choices[Math.floor(Math.random()*choices.length)]}**`
    );
  }

  if (command === "random") {

    const min = Number(args[0]) || 1;
    const max = Number(args[1]) || 100;

    return reply(
      message,
      "🎲 Random",
      `Número: **${Math.floor(Math.random()*(max-min+1))+min}**`
    );
  }

  /* ECONOMY */

  if (
    command === "balance" ||
    command === "wallet" ||
    command === "cash"
  ) {
    return reply(
      message,
      "💰 Balance",
      `💵 Efectivo: **${user.balance}**\n🏦 Banco: **${user.bank}**`,
      COLORS.gold
    );
  }

  if (command === "work") {

    const left =
      cooldown(user, "work", 30000);

    if (left) {
      return reply(
        message,
        "⏳ Trabajo",
        `Espera **${left} segundos**.`
      );
    }

    const amount =
      Math.floor(Math.random()*201)+100;

    user.balance += amount;
    save();

    return reply(
      message,
      "💼 Trabajo",
      `Ganaste **${amount} monedas**.`,
      COLORS.green
    );
  }

  if (command === "daily") {

    const left =
      cooldown(user, "daily", 86400000);

    if (left) {
      return reply(
        message,
        "🎁 Daily",
        "Ya reclamaste tu recompensa diaria."
      );
    }

    user.balance += 500;
    save();

    return reply(
      message,
      "🎁 Recompensa diaria",
      "Recibiste **500 monedas**.",
      COLORS.gold
    );
  }

  if (command === "weekly") {

    const left =
      cooldown(user, "weekly", 604800000);

    if (left) {
      return reply(
        message,
        "🎁 Weekly",
        "Ya reclamaste tu recompensa semanal."
      );
    }

    user.balance += 2500;
    save();

    return reply(
      message,
      "🎁 Recompensa semanal",
      "Recibiste **2500 monedas**.",
      COLORS.gold
    );
  }

  if (command === "deposit") {

    const amount =
      Number(args[0]);

    if (!amount || amount <= 0) {
      return reply(
        message,
        "🏦 Banco",
        `Uso: \`${PREFIX}deposit cantidad\``,
        COLORS.red
      );
    }

    if (amount > user.balance) {
      return reply(
        message,
        "🏦 Banco",
        "No tienes suficiente dinero.",
        COLORS.red
      );
    }

    user.balance -= amount;
    user.bank += amount;
    save();

    return reply(
      message,
      "🏦 Depósito",
      `Depositaste **${amount} monedas**.`
    );
  }

  if (command === "withdraw") {

    const amount =
      Number(args[0]);

    if (!amount || amount <= 0) {
      return reply(
        message,
        "🏦 Banco",
        `Uso: \`${PREFIX}withdraw cantidad\``,
        COLORS.red
      );
    }

    if (amount > user.bank) {
      return reply(
        message,
        "🏦 Banco",
        "No tienes suficiente dinero en el banco.",
        COLORS.red
      );
    }

    user.bank -= amount;
    user.balance += amount;
    save();

    return reply(
      message,
      "🏦 Retiro",
      `Retiraste **${amount} monedas**.`
    );
  }

  if (
    command === "pay" ||
    command === "give"
  ) {

    const target =
      targetMember(message,args[0]);

    const amount =
      Number(args[1]);

    if (
      !target ||
      !amount ||
      amount <= 0
    ) {
      return reply(
        message,
        "💸 Pago",
        `Uso: \`${PREFIX}pay @usuario cantidad\``,
        COLORS.red
      );
    }

    if (amount > user.balance) {
      return reply(
        message,
        "💸 Pago",
        "No tienes suficiente dinero.",
        COLORS.red
      );
    }

    const receiver =
      userData(guild.id,target.id);

    user.balance -= amount;
    receiver.balance += amount;

    save();

    return reply(
      message,
      "💸 Pago",
      `Enviaste **${amount} monedas** a ${target}.`,
      COLORS.green
    );
  }

  /* CRIME */

  if (command === "crime") {

    const left =
      cooldown(user,"crime",120000);

    if (left) {
      return reply(
        message,
        "⏳ Crime",
        `Espera **${left}s**.`
      );
    }

    if (Math.random() < 0.20) {

      const amount =
        Math.floor(Math.random()*201)+500;

      user.balance += amount;
      save();

      return reply(
        message,
        "🍀 Crime",
        `Ganaste **${amount} monedas**.`,
        COLORS.green
      );
    }

    user.balance =
      Math.max(0,user.balance-600);

    save();

    return reply(
      message,
      "💥 Crime",
      "Perdiste **600 monedas**.",
      COLORS.red
    );
  }

  /* RISK */

  if (command === "risk") {

    const left =
      cooldown(user,"risk",60000);

    if (left) {
      return reply(
        message,
        "⏳ Risk",
        `Espera **${left}s**.`
      );
    }

    if (Math.random() < 0.30) {

      const amount =
        Math.floor(Math.random()*251)+300;

      user.balance += amount;
      save();

      return reply(
        message,
        "🍀 Risk",
        `Ganaste **${amount} monedas**.`,
        COLORS.green
      );
    }

    const loss =
      Math.floor(Math.random()*201)+300;

    user.balance =
      Math.max(0,user.balance-loss);

    save();

    return reply(
      message,
      "💥 Risk",
      `Perdiste **${loss} monedas**.`,
      COLORS.red
    );
  }

  /* FUN */

  if (command === "coinflip") {

    return reply(
      message,
      "🪙 Cara o cruz",
      Math.random() < .5
        ? "🪙 **Cara**"
        : "🪙 **Cruz**"
    );
  }

  if (
    command === "dice" ||
    command === "roll"
  ) {

    const max =
      Number(args[0]) || 6;

    return reply(
      message,
      "🎲 Dados",
      `Resultado: **${Math.floor(Math.random()*max)+1}**`
    );
  }

  if (command === "8ball") {

    const answers = [
      "Sí.",
      "No.",
      "Probablemente.",
      "Definitivamente.",
      "No lo sé.",
      "Pregunta más tarde.",
      "Las estrellas dicen que sí.",
      "Las estrellas dicen que no."
    ];

    return reply(
      message,
      "🔮 8Ball",
      answers[
        Math.floor(Math.random()*answers.length)
      ]
    );
  }

  if (command === "joke") {

    const jokes = [
      "¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "¿Qué le dijo un techo a otro? Techo de menos.",
      "¿Qué hace un pez? ¡Nada!",
      "¿Qué hace una computadora cuando tiene frío? Cierra Windows."
    ];

    return reply(
      message,
      "😂 Chiste",
      jokes[Math.floor(Math.random()*jokes.length)]
    );
  }

  /* SOCIAL */

  if (command === "rep") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "👍 Reputación",
        `Uso: \`${PREFIX}rep @usuario\``,
        COLORS.red
      );
    }

    if (
      cooldown(user,"rep",43200000)
    ) {
      return reply(
        message,
        "⏳ Reputación",
        "Ya diste reputación recientemente."
      );
    }

    userData(
      guild.id,
      target.id
    ).rep++;

    save();

    return reply(
      message,
      "👍 Reputación",
      `Le diste reputación a ${target}.`,
      COLORS.green
    );
  }

  if (command === "bio") {

    const target =
      targetMember(message,args[0]) ||
      message.member;

    const data =
      userData(guild.id,target.id);

    return reply(
      message,
      "📖 Biografía",
      data.bio || "Sin biografía."
    );
  }

  if (command === "setbio") {

    if (!raw) {
      return reply(
        message,
        "📖 Biografía",
        `Uso: \`${PREFIX}setbio tu texto\``
      );
    }

    user.bio = raw.slice(0,300);
    save();

    return reply(
      message,
      "📖 Biografía",
      "Tu biografía fue actualizada.",
      COLORS.green
    );
  }

  if (
    command === "level" ||
    command === "xp" ||
    command === "rank"
  ) {

    return reply(
      message,
      "⭐ Nivel",
      `Nivel: **${user.level}**\nXP: **${user.xp}**`
    );
  }

  /* MODERATION */

  if (
    [
      "ban","unban","kick","mute",
      "unmute","timeout","untimeout",
      "warn","unwarn","warnings",
      "clear","purge","slowmode",
      "lock","unlock","nick",
      "resetnick","roleadd","roleremove"
    ].includes(command)
  ) {

    if (!isModerator(message)) {
      return reply(
        message,
        "🔒 Sin permisos",
        "Necesitas permisos de moderación.",
        COLORS.red
      );
    }
  }

  if (
    command === "ban" ||
    command === "kick"
  ) {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🛡️ Moderación",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const reason =
      args.slice(1).join(" ") ||
      "Sin razón";

    if (command === "ban") {

      const ok =
        await target.ban({reason})
          .then(()=>true)
          .catch(()=>false);

      if (!ok) {
        return reply(
          message,
          "🔨 Ban",
          "No pude banear a ese usuario.",
          COLORS.red
        );
      }

      await sendLog(
        guild,
        "Usuario baneado",
        `${target.user.tag}\nPor: ${message.author.tag}\nRazón: ${reason}`,
        COLORS.red
      );

      return reply(
        message,
        "🔨 Ban",
        `${target.user.tag} fue baneado.`,
        COLORS.red
      );
    }

    const ok =
      await target.kick(reason)
        .then(()=>true)
        .catch(()=>false);

    if (!ok) {
      return reply(
        message,
        "👢 Kick",
        "No pude expulsar a ese usuario.",
        COLORS.red
      );
    }

    await sendLog(
      guild,
      "Usuario expulsado",
      `${target.user.tag}\nPor: ${message.author.tag}\nRazón: ${reason}`,
      COLORS.red
    );

    return reply(
      message,
      "👢 Kick",
      `${target.user.tag} fue expulsado.`,
      COLORS.red
    );
  }

  if (
    command === "mute" ||
    command === "timeout"
  ) {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🔇 Timeout",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const ok =
      await target.timeout(
        2 * 60 * 60 * 1000,
        args.slice(1).join(" ") || "Madokami"
      ).then(()=>true)
       .catch(()=>false);

    if (!ok) {
      return reply(
        message,
        "🔇 Timeout",
        "No pude aplicar el timeout.",
        COLORS.red
      );
    }

    await sendLog(
      guild,
      "Usuario silenciado",
      `${target.user.tag}\nDuración: **2 horas**\nPor: ${message.author.tag}`,
      COLORS.red
    );

    return reply(
      message,
      "🔇 Timeout",
      `${target.user.tag} recibió timeout durante **2 horas**.`,
      COLORS.red
    );
  }

  if (
    command === "unmute" ||
    command === "untimeout"
  ) {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🔊 Unmute",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    await target.timeout(null).catch(()=>{});

    return reply(
      message,
      "🔊 Unmute",
      `${target.user.tag} ya no tiene timeout.`,
      COLORS.green
    );
  }

  if (command === "warn") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "⚠️ Warn",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const data =
      userData(guild.id,target.id);

    data.warnings.push({
      reason:
        args.slice(1).join(" ") ||
        "Sin razón",
      moderator:
        message.author.id,
      date: Date.now()
    });

    save();

    await sendLog(
      guild,
      "⚠️ Advertencia",
      `${target.user.tag} recibió una advertencia de ${message.author.tag}.`
    );

    return reply(
      message,
      "⚠️ Warn",
      `${target.user.tag} recibió una advertencia.`,
      COLORS.gold
    );
  }

  if (command === "warnings") {

    const target =
      targetMember(message,args[0]) ||
      message.member;

    const data =
      userData(guild.id,target.id);

    if (!data.warnings.length) {
      return reply(
        message,
        "⚠️ Advertencias",
        `${target.user.tag} no tiene advertencias.`
      );
    }

    return reply(
      message,
      "⚠️ Advertencias",
      data.warnings
        .map(
          (w,i)=>
            `**${i+1}.** ${w.reason}`
        )
        .join("\n"),
      COLORS.gold
    );
  }

  if (command === "unwarn") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "⚠️ Unwarn",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const data =
      userData(guild.id,target.id);

    data.warnings.pop();

    save();

    return reply(
      message,
      "⚠️ Unwarn",
      "Se quitó la última advertencia.",
      COLORS.green
    );
  }

  if (
    command === "clear" ||
    command === "purge"
  ) {

    const amount =
      Math.min(
        Math.max(Number(args[0]) || 10,1),
        100
      );

    const deleted =
      await message.channel
        .bulkDelete(amount,true)
        .catch(()=>null);

    if (!deleted) {
      return reply(
        message,
        "🧹 Clear",
        "No pude eliminar los mensajes.",
        COLORS.red
      );
    }

    await sendLog(
      guild,
      "🧹 Mensajes eliminados",
      `${message.author.tag} eliminó ${deleted.size} mensajes.`
    );

    return reply(
      message,
      "🧹 Clear",
      `Se eliminaron **${deleted.size} mensajes**.`,
      COLORS.green
    );
  }

  if (command === "slowmode") {

    const seconds =
      Math.max(
        0,
        Math.min(
          Number(args[0]) || 0,
          21600
        )
      );

    await message.channel
      .setRateLimitPerUser(seconds)
      .catch(()=>{});

    return reply(
      message,
      "🐢 Slowmode",
      `Slowmode: **${seconds} segundos**.`
    );
  }

  if (
    command === "lock" ||
    command === "unlock"
  ) {

    const everyone =
      guild.roles.everyone;

    const locked =
      command === "lock";

    await message.channel.permissionOverwrites.edit(
      everyone,
      {
        SendMessages: !locked
      }
    ).catch(()=>{});

    return reply(
      message,
      locked ? "🔒 Canal bloqueado" : "🔓 Canal desbloqueado",
      locked
        ? "El canal fue bloqueado."
        : "El canal fue desbloqueado."
    );
  }

  if (command === "nick") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🏷️ Nick",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const nick =
      args.slice(1).join(" ") || null;

    await target.setNickname(nick).catch(()=>{});

    return reply(
      message,
      "🏷️ Nick",
      nick
        ? `Apodo cambiado a **${nick}**.`
        : "Apodo eliminado."
    );
  }

  if (command === "resetnick") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🏷️ Nick",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    await target.setNickname(null).catch(()=>{});

    return reply(
      message,
      "🏷️ Nick",
      "Apodo restablecido.",
      COLORS.green
    );
  }

  /* ADMIN */

  if (
    [
      "log",
      "antilink",
      "antispam",
      "whitelist",
      "welcome",
      "goodbye",
      "autorole",
      "say",
      "announce",
      "autoreplyadd",
      "autoreplydel",
      "autoreplylist",
      "autoreactadd",
      "autoreactdel",
      "autoreactlist"
    ].includes(command)
  ) {

    if (!isAdmin(message)) {
      return reply(
        message,
        "👑 Administración",
        "Solo los administradores pueden usar este comando.",
        COLORS.red
      );
    }
  }

  if (command === "log") {

    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return reply(
        message,
        "📋 Logs",
        `Uso: \`${PREFIX}log #canal\``,
        COLORS.red
      );
    }

    config.logChannel = channel.id;
    save();

    return reply(
      message,
      "📋 Logs",
      `Canal de logs configurado en ${channel}.`,
      COLORS.green
    );
  }

  if (
    command === "antilink"
  ) {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on","off"].includes(value)) {
      return reply(
        message,
        "🔗 Anti-link",
        `Uso: \`${PREFIX}antilink on\` o \`${PREFIX}antilink off\``
      );
    }

    config.antiLink =
      value === "on";

    save();

    return reply(
      message,
      "🔗 Anti-link",
      `Anti-link: **${config.antiLink ? "ACTIVADO" : "DESACTIVADO"}**`,
      COLORS.green
    );
  }

  if (
    command === "antispam"
  ) {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on","off"].includes(value)) {
      return reply(
        message,
        "🚨 Anti-spam",
        `Uso: \`${PREFIX}antispam on\` o \`${PREFIX}antispam off\``
      );
    }

    config.antiSpam =
      value === "on";

    save();

    return reply(
      message,
      "🚨 Anti-spam",
      `Anti-spam: **${config.antiSpam ? "ACTIVADO" : "DESACTIVADO"}**`,
      COLORS.green
    );
  }

  if (command === "whitelist") {

    const target =
      targetMember(message,args[0]);

    if (!target) {
      return reply(
        message,
        "🛡️ Whitelist",
        `Uso: \`${PREFIX}whitelist @usuario\``
      );
    }

    if (
      config.whitelist.includes(target.id)
    ) {
      config.whitelist =
        config.whitelist.filter(
          id => id !== target.id
        );
    } else {
      config.whitelist.push(target.id);
    }

    save();

    return reply(
      message,
      "🛡️ Whitelist",
      `${target} actualizado en la lista blanca.`,
      COLORS.green
    );
  }

  if (command === "welcome") {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on","off"].includes(value)) {
      return reply(
        message,
        "🌸 Bienvenida",
        `Uso: \`${PREFIX}welcome on\``
      );
    }

    config.welcome.enabled =
      value === "on";

    save();

    return reply(
      message,
      "🌸 Bienvenida",
      `Bienvenida: **${config.welcome.enabled ? "ACTIVADA" : "DESACTIVADA"}**`
    );
  }

  if (command === "welcomechannel") {

    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return reply(
        message,
        "🌸 Bienvenida",
        `Uso: \`${PREFIX}welcomechannel #canal\``
      );
    }

    config.welcome.channel =
      channel.id;

    save();

    return reply(
      message,
      "🌸 Bienvenida",
      `Canal configurado: ${channel}`,
      COLORS.green
    );
  }

  if (command === "goodbye") {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on","off"].includes(value)) {
      return reply(
        message,
        "👋 Despedida",
        `Uso: \`${PREFIX}goodbye on\``
      );
    }

    config.goodbye.enabled =
      value === "on";

    save();

    return reply(
      message,
      "👋 Despedida",
      `Despedida: **${config.goodbye.enabled ? "ACTIVADA" : "DESACTIVADA"}**`
    );
  }

  if (command === "goodbyechannel") {

    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return reply(
        message,
        "👋 Despedida",
        `Uso: \`${PREFIX}goodbyechannel #canal\``
      );
    }

    config.goodbye.channel =
      channel.id;

    save();

    return reply(
      message,
      "👋 Despedida",
      `Canal configurado: ${channel}`,
      COLORS.green
    );
  }

  if (command === "autorole") {

    const role =
      targetRole(
        guild,
        args[0]
      );

    if (!role) {
      return reply(
        message,
        "🎭 Autorol",
        `Uso: \`${PREFIX}autorole @rol\``
      );
    }

    config.autoRole =
      role.id;

    save();

    return reply(
      message,
      "🎭 Autorol",
      `Los nuevos miembros recibirán ${role}.`,
      COLORS.green
    );
  }

  if (
    command === "say" ||
    command === "announce"
  ) {

    if (!raw) {
      return reply(
        message,
        "📢 Say",
        `Uso: \`${PREFIX}say mensaje\``
      );
    }

    await message.delete().catch(()=>{});

    return message.channel.send({
      content: clean(raw,2000)
    });
  }

  /* =========================
     GENERIC SAFE COMMANDS
  ========================= */

  if (command === "permissions") {

    return reply(
      message,
      "🔐 Permisos",
      message.member.permissions.toArray()
        .map(x => `• ${x}`)
        .join("\n")
    );
  }

  if (command === "serverid") {
    return message.reply(guild.id);
  }

  if (command === "myid") {
    return message.reply(message.author.id);
  }

  if (command === "date") {
    return reply(
      message,
      "📅 Fecha",
      new Date().toLocaleDateString("es-ES")
    );
  }

  if (command === "time") {
    return reply(
      message,
      "🕐 Hora",
      new Date().toLocaleTimeString("es-ES")
    );
  }

  if (command === "status") {

    return reply(
      message,
      "📡 Estado",
      `🟢 Online\n🏠 Servidores: **${client.guilds.cache.size}**\n📶 Ping: **${client.ws.ping}ms**`
    );
  }

  if (command === "invite") {

    return reply(
      message,
      "🔗 Invitación",
      "Usa el enlace de instalación de tu aplicación de Discord para invitar a Madokami."
    );
  }

  /* Comandos informativos que no necesitan argumentos */

  const categoryCommand = Object.values(CATEGORIES)
    .flatMap(x => x.commands.map(c => c[0]));

  if (categoryCommand.includes(command)) {

    return reply(
      message,
      `🌸 ${command}`,
      `El comando \`${PREFIX}${command}\` está disponible en Madokami.`
    );
  }

  return reply(
    message,
    "❌ Comando",
    `No existe \`${PREFIX}${command}\`.\nUsa \`${PREFIX}help\`.`,
    COLORS.red
  );
}

/* =========================
   COMMAND LIST
========================= */

const ALL_COMMANDS = new Set([
  "help",
  "helpad",
  ...Object.values(CATEGORIES)
    .flatMap(c => c.commands.map(c => c[0])),
  ...[
    "log",
    "antilink",
    "antispam",
    "whitelist",
    "welcome",
    "welcomechannel",
    "goodbye",
    "goodbyechannel",
    "autorole",
    "say",
    "announce"
  ]
]);

/* =========================
   MESSAGE CREATE
========================= */

const spamTracker = new Map();

client.on(
  "messageCreate",
  async message => {

    if (!message.guild) return;
    if (message.author.bot) return;

    const config =
      guildData(message.guild.id);

    const user =
      userData(
        message.guild.id,
        message.author.id
      );

    /* ANTI SPAM */

    if (
      config.antiSpam &&
      !isAdmin(message) &&
      !config.whitelist.includes(message.author.id)
    ) {

      const key =
        `${message.guild.id}:${message.author.id}`;

      const now = Date.now();

      const times =
        (spamTracker.get(key) || [])
          .filter(t => now - t < 7000);

      times.push(now);

      spamTracker.set(key,times);

      if (times.length >= 6) {

        spamTracker.set(key,[]);

        await message.delete().catch(()=>{});

        await message.channel.send({
          content:
            `🚨 <@${message.author.id}> no hagas spam.`
        }).then(msg =>
          setTimeout(
            () => msg.delete().catch(()=>{}),
            5000
          )
        ).catch(()=>{});

        await sendLog(
          message.guild,
          "🚨 Anti-spam",
          `${message.author.tag} superó el límite de mensajes.`,
          COLORS.red
        );

        return;
      }
    }

    /* ANTI LINK */

    if (
      config.antiLink &&
      !isAdmin(message) &&
      !config.whitelist.includes(message.author.id) &&
      /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(
        message.content
      )
    ) {

      await message.delete().catch(()=>{});

      const timed =
        await message.member
          .timeout(
            2 * 60 * 60 * 1000,
            "Madokami Anti-link"
          )
          .then(()=>true)
          .catch(()=>false);

      const warning =
        await message.channel.send({
          content:
            `🔗 <@${message.author.id}> no puedes enviar enlaces aquí.${timed ? " Timeout: **2 horas**." : ""}`
        }).catch(()=>null);

      if (warning) {
        setTimeout(
          () => warning.delete().catch(()=>{}),
          5000
        );
      }

      await sendLog(
        message.guild,
        "🔗 Anti-link",
        `${message.author.tag}\nMensaje eliminado.\nTimeout: ${timed ? "2 horas" : "no aplicado"}`,
        COLORS.red
      );

      return;
    }

    /* AUTO REPLY */

    for (const item of config.autoReplies) {

      if (
        message.content
          .toLowerCase()
          .includes(item.trigger.toLowerCase())
      ) {

        await message.channel
          .send(item.response)
          .catch(()=>{});

        break;
      }
    }

    /* AUTO REACTION */

    for (const item of config.autoReactions) {

      if (
        message.content
          .toLowerCase()
          .includes(item.trigger.toLowerCase())
      ) {

        await message.react(item.emoji)
          .catch(()=>{});
      }
    }

    /* XP */

    if (!message.content.startsWith(PREFIX)) {

      if (Math.random() < 0.10) {

        user.xp += 5;

        const required =
          user.level * 100;

        if (user.xp >= required) {

          user.xp -= required;
          user.level++;

          const levelMessage =
            await message.channel.send(
              `⭐ <@${message.author.id}> subió al nivel **${user.level}**.`
            ).catch(()=>null);

          if (levelMessage) {
            setTimeout(
              () => levelMessage.delete().catch(()=>{}),
              5000
            );
          }
        }

        save();
      }

      return;
    }

    /* COMMAND */

    const body =
      message.content
        .slice(PREFIX.length)
        .trim();

    if (!body) return;

    const parts =
      body.split(/\s+/);

    const command =
      parts.shift().toLowerCase();

    const raw =
      parts.join(" ");

    if (!ALL_COMMANDS.has(command)) {

      return reply(
        message,
        "❌ Comando no encontrado",
        `No existe \`${PREFIX}${command}\`.\nUsa \`${PREFIX}help\` para ver el menú.`,
        COLORS.red
      );
    }

    try {

      await execute(
        message,
        command,
        parts,
        raw
      );

    } catch (error) {

      console.error(
        `Error en ${command}:`,
        error
      );

      await reply(
        message,
        "❌ Error",
        "Ocurrió un error ejecutando el comando.",
        COLORS.red
      ).catch(()=>{});
    }
  }
);

/* =========================
   INTERACTIONS
========================= */

client.on(
  "interactionCreate",
  async interaction => {

    /* CATEGORY */

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId === "madokami_category"
    ) {

      const key =
        interaction.values[0];

      return interaction.update({
        embeds: [
          categoryEmbed(key,1)
        ],
        components: [
          helpMenu()[0],
          helpMenu()[1],
          helpMenu()[2],
          categoryButtons(key,1)
        ].filter(Boolean)
      });
    }

    /* HELP BUTTONS */

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "madokami_"
      )
    ) {

      const [
        action,
        key,
        currentPage
      ] =
        interaction.customId.split(":");

      const page =
        Number(currentPage);

      if (action === "madokami_home") {

        return interaction.update({
          embeds: [homeEmbed()],
          components: helpMenu()
        });
      }

      if (action === "madokami_prev") {

        return interaction.update({
          embeds: [
            categoryEmbed(key,1)
          ],
          components: [
            ...helpMenu(),
            categoryButtons(key,1)
          ]
        });
      }

      if (action === "madokami_next") {

        return interaction.update({
          embeds: [
            categoryEmbed(key,2)
          ],
          components: [
            ...helpMenu(),
            categoryButtons(key,2)
          ]
        });
      }
    }

    /* ADMIN HELP */

    if (
      interaction.isButton() &&
      (
        interaction.customId === "admin_prev" ||
        interaction.customId === "admin_next"
      )
    ) {

      const page =
        interaction.customId === "admin_next"
          ? 2
          : 1;

      if (!isAdmin(interaction)) {
        return interaction.reply({
          content:
            "🔒 Solo administradores.",
          ephemeral: true
        });
      }

      return interaction.update({
        embeds: [
          adminEmbed(page)
        ],
        components: [
          new ActionRowBuilder().addComponents(

            new ButtonBuilder()
              .setCustomId("admin_prev")
              .setLabel("◀️")
              .setStyle(ButtonStyle.Secondary)
              .setDisabled(page === 1),

            new ButtonBuilder()
              .setCustomId("admin_next")
              .setLabel("▶️")
              .setStyle(ButtonStyle.Primary)
              .setDisabled(page === 2)

          )
        ]
      });
    }
  }
);

/* =========================
   LOGS
========================= */

client.on(
  "messageDelete",
  message => {

    if (!message.guild) return;
    if (message.author?.bot) return;

    sendLog(
      message.guild,
      "🗑️ Mensaje eliminado",
      `Autor: **${message.author?.tag || "Desconocido"}**\nCanal: <#${message.channel?.id || "0"}>\nContenido: ${message.content || "[no disponible]"}`,
      COLORS.red
    );
  }
);

client.on(
  "messageUpdate",
  (oldMessage,newMessage) => {

    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;

    if (
      oldMessage.content ===
      newMessage.content
    ) return;

    sendLog(
      newMessage.guild,
      "✏️ Mensaje editado",
      `Autor: **${newMessage.author?.tag || "Desconocido"}**\nAntes:\n${oldMessage.content || "[sin caché]"}\n\nDespués:\n${newMessage.content || "[sin caché]"}`,
      COLORS.gold
    );
  }
);

/* =========================
   MEMBERS
========================= */

client.on(
  "guildMemberAdd",
  async member => {

    const config =
      guildData(member.guild.id);

    if (config.autoRole) {

      const role =
        member.guild.roles.cache.get(
          config.autoRole
        );

      if (role) {
        await member.roles
          .add(role)
          .catch(()=>{});
      }
    }

    if (
      config.welcome.enabled &&
      config.welcome.channel
    ) {

      const channel =
        member.guild.channels.cache.get(
          config.welcome.channel
        );

      if (channel?.isTextBased()) {

        const text =
          config.welcome.message
            .replaceAll(
              "{user}",
              `<@${member.id}>`
            )
            .replaceAll(
              "{server}",
              member.guild.name
            )
            .replaceAll(
              "{count}",
              String(member.guild.memberCount)
            );

        await channel.send(text)
          .catch(()=>{});
      }
    }

    await sendLog(
      member.guild,
      "📥 Miembro entró",
      `${member.user.tag} (${member.id})`,
      COLORS.green
    );
  }
);

client.on(
  "guildMemberRemove",
  async member => {

    const config =
      guildData(member.guild.id);

    if (
      config.goodbye.enabled &&
      config.goodbye.channel
    ) {

      const channel =
        member.guild.channels.cache.get(
          config.goodbye.channel
        );

      if (channel?.isTextBased()) {

        const text =
          config.goodbye.message
            .replaceAll(
              "{user}",
              member.user.tag
            )
            .replaceAll(
              "{server}",
              member.guild.name
            );

        await channel.send(text)
          .catch(()=>{});
      }
    }

    await sendLog(
      member.guild,
      "📤 Miembro salió",
      `${member.user?.tag || member.id}`,
      COLORS.red
    );
  }
);

/* =========================
   ROLE / CHANNEL LOGS
========================= */

client.on(
  "roleCreate",
  role => {

    sendLog(
      role.guild,
      "🎭 Rol creado",
      `Rol: **${role.name}**\nID: \`${role.id}\``
    );
  }
);

client.on(
  "roleDelete",
  role => {

    sendLog(
      role.guild,
      "🗑️ Rol eliminado",
      `Rol: **${role.name}**\nID: \`${role.id}\``,
      COLORS.red
    );
  }
);

client.on(
  "roleUpdate",
  (oldRole,newRole) => {

    if (
      oldRole.name === newRole.name &&
      oldRole.hexColor === newRole.hexColor
    ) return;

    sendLog(
      newRole.guild,
      "🎨 Rol actualizado",
      `Antes: **${oldRole.name}**\nDespués: **${newRole.name}**`
    );
  }
);

client.on(
  "channelCreate",
  channel => {

    if (!channel.guild) return;

    sendLog(
      channel.guild,
      "📁 Canal creado",
      `Canal: **${channel.name}**\nID: \`${channel.id}\``,
      COLORS.green
    );
  }
);

client.on(
  "channelDelete",
  channel => {

    if (!channel.guild) return;

    sendLog(
      channel.guild,
      "🗑️ Canal eliminado",
      `Canal: **${channel.name}**\nID: \`${channel.id}\``,
      COLORS.red
    );
  }
);

client.on(
  "channelUpdate",
  (oldChannel,newChannel) => {

    if (!newChannel.guild) return;

    if (
      oldChannel.name ===
      newChannel.name
    ) return;

    sendLog(
      newChannel.guild,
      "✏️ Canal actualizado",
      `Antes: **${oldChannel.name}**\nDespués: **${newChannel.name}**`
    );
  }
);

/* =========================
   MEMBER UPDATE
========================= */

client.on(
  "guildMemberUpdate",
  (oldMember,newMember) => {

    if (
      oldMember.nickname !==
      newMember.nickname
    ) {

      sendLog(
        newMember.guild,
        "🏷️ Apodo actualizado",
        `${newMember.user.tag}\nAntes: ${oldMember.nickname || "ninguno"}\nDespués: ${newMember.nickname || "ninguno"}`
      );
    }

    const oldRoles =
      new Set(oldMember.roles.cache.keys());

    const newRoles =
      new Set(newMember.roles.cache.keys());

    const added =
      [...newRoles]
        .filter(
          id =>
            !oldRoles.has(id) &&
            id !== newMember.guild.id
        );

    const removed =
      [...oldRoles]
        .filter(
          id =>
            !newRoles.has(id) &&
            id !== newMember.guild.id
        );

    if (added.length || removed.length) {

      sendLog(
        newMember.guild,
        "🎭 Roles modificados",
        `${newMember.user.tag}\nAñadidos: ${
          added.map(id => `<@&${id}>`).join(", ") || "ninguno"
        }\nQuitados: ${
          removed.map(id => `<@&${id}>`).join(", ") || "ninguno"
        }`
      );
    }
  }
);

/* =========================
   READY
========================= */

client.once(
  "ready",
  () => {

    console.log(
      `🌸 Madokami conectada como ${client.user.tag}`
    );

    client.user.setActivity(
      "m!help"
    );
  }
);

/* =========================
   LOGIN
========================= */

if (!process.env.DISCORD_TOKEN) {
  console.error(
    "❌ Falta DISCORD_TOKEN en las variables de entorno."
  );
  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
