// ============================================================
// 🌸 MADOKAMI — DISCORD BOT
// Prefix: m!
// discord.js v14
// Sin IA / Sin Gemini
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
  ChannelType
} = require("discord.js");

const express = require("express");
const fs = require("fs");
const path = require("path");

// ============================================================
// ⚙️ CONFIGURACIÓN
// ============================================================

const PREFIX = "m!";
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, "madokami-data.json");

// ============================================================
// 🌐 SERVIDOR WEB PARA RENDER
// ============================================================

const app = express();

app.get("/", (req, res) => {
  res.status(200).send("🌸 Madokami está online.");
});

app.get("/health", (req, res) => {
  res.json({
    online: true,
    bot: "Madokami"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor web activo en puerto ${PORT}`);
});

// ============================================================
// 💾 BASE DE DATOS JSON
// ============================================================

let db = {
  guilds: {},
  users: {}
};

try {
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  }
} catch (error) {
  console.error("❌ Error leyendo la base de datos:", error);
}

function save() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
  } catch (error) {
    console.error("❌ Error guardando datos:", error);
  }
}

function guildData(id) {
  if (!db.guilds[id]) {
    db.guilds[id] = {
      logChannel: null,

      antiLink: false,
      antiSpam: false,
      antiCaps: false,
      antiMention: false,

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

      autorole: null,

      autoReplies: [],
      autoReactions: [],

      reactionRoles: {},

      botStatus: "m!help"
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
      inventory: {},
      warnings: [],
      bio: "",
      afk: false,
      afkText: "",
      birthday: "",
      timezone: "UTC",
      notes: [],
      cooldowns: {},
      streak: 0
    };
  }

  return db.users[guildId][userId];
}

// ============================================================
// 🧰 FUNCIONES
// ============================================================

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function money(amount) {
  return `${Math.max(0, Math.floor(amount)).toLocaleString("es-ES")} 💰`;
}

function clean(text, max = 3900) {
  text = String(text ?? "");

  if (text.length <= max) return text;

  return text.slice(0, max - 3) + "...";
}

function isAdmin(message) {
  return Boolean(
    message.member?.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function canManage(message) {
  return Boolean(
    message.member?.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    ) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function hasPermission(message, permission) {
  return Boolean(
    message.member?.permissions.has(permission)
  );
}

function isWhitelisted(guildId, userId) {
  return guildData(guildId).whitelist.includes(userId);
}

function targetMember(message, input) {
  if (!input) return null;

  const id = input.replace(/[<@!>]/g, "");

  return message.guild.members.cache.get(id) || null;
}

function targetRole(guild, input) {
  if (!input) return null;

  const id = input.replace(/[<@&>]/g, "");

  return (
    guild.roles.cache.get(id) ||
    guild.roles.cache.find(
      role =>
        role.name.toLowerCase() ===
        String(input).toLowerCase()
    )
  );
}

function cooldown(user, key, milliseconds) {
  const last = user.cooldowns[key] || 0;
  const remaining = milliseconds - (Date.now() - last);

  if (remaining > 0) {
    return Math.ceil(remaining / 1000);
  }

  user.cooldowns[key] = Date.now();
  save();

  return 0;
}

function addMoney(user, amount) {
  user.balance = Math.max(0, user.balance + amount);
  save();
}

function addItem(user, item, amount = 1) {
  user.inventory[item] =
    (user.inventory[item] || 0) + amount;

  save();
}

function removeItem(user, item, amount = 1) {
  if ((user.inventory[item] || 0) < amount) {
    return false;
  }

  user.inventory[item] -= amount;

  if (user.inventory[item] <= 0) {
    delete user.inventory[item];
  }

  save();
  return true;
}

// ============================================================
// 📋 LOGS
// ============================================================

async function sendLog(guild, title, description) {
  const data = guildData(guild.id);

  if (!data.logChannel) return;

  const channel =
    guild.channels.cache.get(data.logChannel);

  if (!channel?.isTextBased()) return;

  try {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x9b59b6)
          .setTitle(`📋 ${title}`)
          .setDescription(clean(description))
          .setTimestamp()
          .setFooter({
            text: "Madokami Logs"
          })
      ]
    });
  } catch {}
}

// ============================================================
// 📚 AYUDA NORMAL
// ============================================================

const CATEGORIES = {

  economia: {
    name: "💰 Economía",
    color: 0xf1c40f,
    commands: [
      ["balance", "Ver saldo"],
      ["wallet", "Ver cartera"],
      ["cash", "Ver dinero"],
      ["work", "Trabajar"],
      ["daily", "Recompensa diaria"],
      ["weekly", "Recompensa semanal"],
      ["job", "Cobrar trabajo"],
      ["salary", "Cobrar salario"],
      ["beg", "Pedir ayuda"],
      ["fish", "Pescar"],
      ["mine", "Minar"],
      ["farm", "Trabajar en granja"],
      ["collect", "Recolectar"],
      ["quest", "Completar misión"],
      ["bonus", "Bono"],
      ["crime", "Juego ficticio de riesgo"],
      ["risk", "Juego ficticio de riesgo"],
      ["bank", "Ver banco"],
      ["deposit", "Depositar"],
      ["withdraw", "Retirar"],
      ["pay", "Pagar"],
      ["give", "Dar dinero"],
      ["shop", "Tienda"],
      ["buy", "Comprar"],
      ["sell", "Vender"],
      ["inventory", "Inventario"]
    ]
  },

  moderacion: {
    name: "🛡️ Moderación",
    color: 0xe74c3c,
    commands: [
      ["ban", "Banear"],
      ["unban", "Desbanear"],
      ["kick", "Expulsar"],
      ["timeout", "Silenciar temporalmente"],
      ["untimeout", "Quitar timeout"],
      ["mute", "Silenciar"],
      ["unmute", "Quitar silencio"],
      ["warn", "Advertir"],
      ["unwarn", "Quitar advertencia"],
      ["warnings", "Ver advertencias"],
      ["clear", "Borrar mensajes"],
      ["purge", "Borrar mensajes"],
      ["slowmode", "Cambiar slowmode"],
      ["lock", "Bloquear canal"],
      ["unlock", "Desbloquear canal"],
      ["nick", "Cambiar apodo"],
      ["resetnick", "Restablecer apodo"],
      ["roleadd", "Dar rol"],
      ["roleremove", "Quitar rol"],
      ["roleinfo", "Información del rol"],
      ["channelinfo", "Información del canal"],
      ["modstats", "Estadísticas de moderación"]
    ]
  },

  utilidad: {
    name: "🔧 Utilidad",
    color: 0x3498db,
    commands: [
      ["ping", "Ver latencia"],
      ["uptime", "Ver tiempo activo"],
      ["botinfo", "Información de Madokami"],
      ["serverinfo", "Información del servidor"],
      ["userinfo", "Información de usuario"],
      ["avatar", "Ver avatar"],
      ["servericon", "Ver icono"],
      ["roles", "Lista de roles"],
      ["channels", "Lista de canales"],
      ["membercount", "Cantidad de miembros"],
      ["channel", "Información del canal"],
      ["role", "Información del rol"],
      ["emoji", "Información de emoji"],
      ["calc", "Calculadora"],
      ["choose", "Elegir opción"],
      ["random", "Número aleatorio"],
      ["reverse", "Invertir texto"],
      ["uppercase", "Mayúsculas"],
      ["lowercase", "Minúsculas"],
      ["poll", "Crear encuesta"],
      ["wordcount", "Contar palabras"],
      ["serverid", "ID del servidor"],
      ["myid", "Tu ID"]
    ]
  },

  diversion: {
    name: "🎮 Diversión",
    color: 0x9b59b6,
    commands: [
      ["8ball", "Bola mágica"],
      ["coinflip", "Cara o cruz"],
      ["dice", "Dado"],
      ["roll", "Dados personalizados"],
      ["rps", "Piedra papel tijera"],
      ["trivia", "Trivia"],
      ["guess", "Adivinar número"],
      ["joke", "Chiste"],
      ["compliment", "Cumplido"],
      ["roast", "Broma ligera"],
      ["fact", "Dato curioso"],
      ["fortune", "Fortuna"],
      ["scramble", "Desordenar palabra"],
      ["anagram", "Anagrama"],
      ["ascii", "Texto decorado"],
      ["mock", "Texto alternado"],
      ["wyr", "Qué prefieres"],
      ["riddle", "Acertijo"],
      ["pun", "Juego de palabras"],
      ["quote", "Frase"],
      ["binary", "Texto a binario"],
      ["morse", "Texto a Morse"],
      ["vowels", "Contar vocales"],
      ["count", "Contar"],
      ["echo", "Repetir"]
    ]
  },

  social: {
    name: "👥 Social",
    color: 0x2ecc71,
    commands: [
      ["profile", "Ver perfil"],
      ["rep", "Dar reputación"],
      ["bio", "Ver biografía"],
      ["setbio", "Cambiar biografía"],
      ["level", "Ver nivel"],
      ["xp", "Ver XP"],
      ["rank", "Ver rango"],
      ["top", "Top de XP"],
      ["afk", "Activar AFK"],
      ["setafk", "Mensaje AFK"],
      ["birthday", "Ver cumpleaños"],
      ["setbirthday", "Guardar cumpleaños"],
      ["timezone", "Zona horaria"],
      ["settimezone", "Guardar zona horaria"],
      ["social", "Resumen social"],
      ["joined", "Fecha de entrada"],
      ["rolesme", "Mis roles"],
      ["members", "Miembros"],
      ["online", "Miembros online"],
      ["notes", "Ver notas"],
      ["note", "Añadir nota"],
      ["clearnotes", "Borrar notas"],
      ["mydata", "Mis datos"]
    ]
  },

  recompensas: {
    name: "🎁 Recompensas",
    color: 0xe67e22,
    commands: [
      ["rewards", "Ver recompensas"],
      ["reward", "Reclamar recompensa"],
      ["dailyreward", "Recompensa diaria"],
      ["weeklyreward", "Recompensa semanal"],
      ["monthlyreward", "Recompensa mensual"],
      ["streak", "Ver racha"],
      ["bonus", "Bono"],
      ["quest", "Misión"],
      ["quests", "Misiones"],
      ["achievement", "Logro"],
      ["achievements", "Logros"],
      ["milestone", "Hito"],
      ["badges", "Insignias"],
      ["collection", "Colección"],
      ["prize", "Premio"]
    ]
  },

  estadisticas: {
    name: "📊 Estadísticas",
    color: 0x1abc9c,
    commands: [
      ["stats", "Tus estadísticas"],
      ["mystats", "Tus estadísticas"],
      ["serverstats", "Estadísticas del servidor"],
      ["memberstats", "Estadísticas de miembros"],
      ["messages", "Mensajes"],
      ["activity", "Actividad"],
      ["levels", "Niveles"],
      ["levelstats", "Estadísticas de nivel"],
      ["xpstats", "Estadísticas de XP"],
      ["rankstats", "Estadísticas de rango"],
      ["leaderboard", "Ranking"],
      ["topcoins", "Top dinero"],
      ["topxp", "Top XP"],
      ["toprep", "Top reputación"],
      ["onlinecount", "Usuarios online"],
      ["rolescount", "Cantidad de roles"],
      ["emojicount", "Cantidad de emojis"],
      ["boosts", "Boosts"]
    ]
  },

  personalizacion: {
    name: "🎨 Personalización",
    color: 0xff69b4,
    commands: [
      ["setcolor", "Guardar color"],
      ["color", "Color"],
      ["settheme", "Tema"],
      ["theme", "Ver tema"],
      ["settitle", "Título"],
      ["title", "Ver título"],
      ["setstatus", "Estado"],
      ["status", "Ver estado"],
      ["setquote", "Guardar frase"],
      ["quote", "Ver frase"],
      ["preferences", "Preferencias"],
      ["settings", "Configuración personal"]
    ]
  },

  logros: {
    name: "🏅 Logros",
    color: 0xf39c12,
    commands: [
      ["achievements", "Ver logros"],
      ["achievement", "Ver logro"],
      ["progress", "Progreso"],
      ["milestones", "Hitos"],
      ["badges", "Insignias"],
      ["titles", "Títulos"],
      ["collection", "Colección"],
      ["mastery", "Maestría"],
      ["firststeps", "Primeros pasos"],
      ["worker", "Trabajador"],
      ["saver", "Ahorrador"],
      ["explorer", "Explorador"],
      ["socialstar", "Estrella social"],
      ["veteran", "Veterano"]
    ]
  },

  minijuegos: {
    name: "🎲 Minijuegos",
    color: 0x8e44ad,
    commands: [
      ["dicegame", "Juego de dados"],
      ["coinflip", "Cara o cruz"],
      ["rps", "Piedra papel tijera"],
      ["guess", "Adivina"],
      ["higher", "Más alto"],
      ["lower", "Más bajo"],
      ["trivia", "Trivia"],
      ["quiz", "Quiz"],
      ["mathgame", "Reto matemático"],
      ["riddle", "Acertijo"],
      ["word", "Palabra"],
      ["scramble", "Palabra mezclada"],
      ["anagram", "Anagrama"],
      ["memory", "Memoria"],
      ["sequence", "Secuencia"],
      ["evenodd", "Par o impar"],
      ["truefalse", "Verdadero o falso"]
    ]
  },

  madokami: {
    name: "🌸 Madokami",
    color: 0xff69b4,
    commands: [
      ["madokami", "Información de Madokami"],
      ["about", "Sobre Madokami"],
      ["info", "Información"],
      ["version", "Versión"],
      ["credits", "Créditos"],
      ["features", "Funciones"],
      ["commands", "Comandos"],
      ["support", "Soporte"],
      ["feedback", "Enviar opinión"],
      ["bug", "Reportar error"],
      ["suggest", "Enviar sugerencia"],
      ["faq", "Preguntas frecuentes"],
      ["quickstart", "Inicio rápido"],
      ["prefix", "Ver prefijo"],
      ["health", "Estado del bot"]
    ]
  },

  informacion: {
    name: "📦 Información",
    color: 0x95a5a6,
    commands: [
      ["server", "Servidor"],
      ["serverinfo", "Información del servidor"],
      ["userinfo", "Información de usuario"],
      ["members", "Miembros"],
      ["roles", "Roles"],
      ["channels", "Canales"],
      ["emojis", "Emojis"],
      ["botinfo", "Bot"],
      ["owner", "Dueño del servidor"],
      ["created", "Fecha de creación"],
      ["joined", "Fecha de entrada"],
      ["permissions", "Permisos"],
      ["servericon", "Icono"],
      ["membercount", "Miembros"]
    ]
  }
};

// ============================================================
// 👑 AYUDA DE ADMINISTRACIÓN
// ============================================================

const ADMIN_CATEGORIES = {

  config: {
    name: "⚙️ Configuración",
    color: 0x5865f2,
    commands: [
      ["setup", "Configuración inicial"],
      ["settings", "Configuración"],
      ["log", "Canal de logs"],
      ["welcome", "Activar/desactivar bienvenida"],
      ["welcomechannel", "Canal de bienvenida"],
      ["welcomemessage", "Mensaje de bienvenida"],
      ["testwelcome", "Probar bienvenida"],
      ["goodbye", "Activar/desactivar despedida"],
      ["goodbyechannel", "Canal de despedida"],
      ["goodbyemessage", "Mensaje de despedida"],
      ["autorole", "Rol automático"],
      ["say", "Enviar mensaje como bot"],
      ["announce", "Crear anuncio"],
      ["autoreplyadd", "Añadir autorespuesta"],
      ["autoreplydel", "Eliminar autorespuesta"],
      ["autoreplylist", "Lista de autorespuestas"],
      ["autoreactadd", "Añadir reacción automática"],
      ["autoreactdel", "Eliminar reacción automática"],
      ["autoreactlist", "Lista de reacciones"],
      ["status", "Cambiar estado del bot"]
    ]
  },

  seguridad: {
    name: "🛡️ Seguridad",
    color: 0xe74c3c,
    commands: [
      ["antilink", "Anti-links"],
      ["antispam", "Anti-spam"],
      ["whitelist", "Lista blanca"],
      ["anticaps", "Anti-caps"],
      ["antimention", "Anti-mentions"],
      ["lockdown", "Bloqueo del servidor"],
      ["unlockdown", "Desbloqueo"],
      ["quarantine", "Cuarentena"],
      ["unquarantine", "Quitar cuarentena"],
      ["botfilter", "Filtro de bots"],
      ["invitefilter", "Filtro de invitaciones"],
      ["linkfilter", "Filtro de enlaces"],
      ["security", "Estado de seguridad"],
      ["securitytest", "Prueba de seguridad"]
    ]
  },

  logs: {
    name: "📋 Logs",
    color: 0x9b59b6,
    commands: [
      ["logstatus", "Estado de logs"],
      ["logmessages", "Logs de mensajes"],
      ["logedits", "Logs de ediciones"],
      ["logmod", "Logs de moderación"],
      ["logjoins", "Logs de entradas/salidas"],
      ["logroles", "Logs de roles"],
      ["logchannels", "Logs de canales"],
      ["logconfig", "Logs de configuración"],
      ["logsecurity", "Logs de seguridad"],
      ["logcommands", "Logs de comandos"],
      ["logtest", "Probar logs"],
      ["logreset", "Restablecer logs"]
    ]
  }
};

// ============================================================
// 🗂️ COMANDOS
// ============================================================

const COMMANDS = new Map();

for (const [category, data] of Object.entries(CATEGORIES)) {
  for (const [command, description] of data.commands) {
    COMMANDS.set(command, {
      category,
      description
    });
  }
}

for (const data of Object.values(ADMIN_CATEGORIES)) {
  for (const [command, description] of data.commands) {
    COMMANDS.set(command, {
      category: "admin",
      description
    });
  }
}

// ============================================================
// 🤖 CLIENTE DISCORD
// ============================================================

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
// 🌸 EMBEDS
// ============================================================

function commandEmbed(category, page = 0) {
  const data = CATEGORIES[category];

  if (!data) {
    return new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle("🌸 Madokami")
      .setDescription(
        "Selecciona una categoría para ver sus comandos."
      );
  }

  const start = page * 25;
  const commands = data.commands.slice(start, start + 25);

  const text = commands
    .map(
      ([command, description], index) =>
        `**${start + index + 1}.** \`${PREFIX}${command}\` — ${description}`
    )
    .join("\n");

  return new EmbedBuilder()
    .setColor(data.color)
    .setTitle(`${data.name} • Madokami`)
    .setDescription(text || "No hay comandos en esta página.")
    .setFooter({
      text: `Página ${page + 1} • Usa ${PREFIX}help`
    })
    .setTimestamp();
}

function helpMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_help_menu")
      .setPlaceholder("🌸 Selecciona una categoría")
      .addOptions(
        Object.entries(CATEGORIES).map(
          ([key, data]) => ({
            label: data.name.replace(/^[^\s]+\s/, ""),
            value: key,
            emoji: data.name.match(/^\S+/)?.[0] || "🌸",
            description: "Ver comandos"
          })
        )
      )
  );
}

function adminMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_admin_menu")
      .setPlaceholder("👑 Selecciona una categoría")
      .addOptions(
        Object.entries(ADMIN_CATEGORIES).map(
          ([key, data]) => ({
            label: data.name.replace(/^[^\s]+\s/, ""),
            value: key,
            emoji: data.name.match(/^\S+/)?.[0] || "👑",
            description: "Comandos administrativos"
          })
        )
      )
  );
}

// ============================================================
// 💬 EJECUCIÓN DE COMANDOS
// ============================================================

async function executeCommand(message, command, args, raw) {

  const guild = message.guild;
  const user = userData(guild.id, message.author.id);
  const config = guildData(guild.id);

  // ----------------------------------------------------------
  // 👑 ADMIN
  // ----------------------------------------------------------

  const adminCommand = Object.values(ADMIN_CATEGORIES)
    .some(data =>
      data.commands.some(x => x[0] === command)
    );

  if (adminCommand && !isAdmin(message)) {
    return message.reply(
      "❌ Necesitas permisos de **Administrador** para usar este comando."
    );
  }

  // ----------------------------------------------------------
  // 📚 HELP
  // ----------------------------------------------------------

  if (command === "help") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle("🌸 MADOKAMI • AYUDA")
          .setDescription(
            "Bienvenido al centro de comandos de Madokami.\n\n" +
            "Selecciona una categoría en el menú.\n\n" +
            "✨ **12 categorías**\n" +
            "🌌 Prefijo: `m!`\n" +
            "👑 Administración: `m!helpad`"
          )
          .setFooter({
            text: "Madokami • Discord Bot"
          })
          .setTimestamp()
      ],
      components: [helpMenu()]
    });
  }

  if (command === "helpad") {
    if (!isAdmin(message)) {
      return message.reply(
        "❌ Solo los administradores pueden usar `m!helpad`."
      );
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("👑 MADOKAMI • ADMINISTRACIÓN")
          .setDescription(
            "Panel exclusivo para administradores.\n\n" +
            "Selecciona una categoría."
          )
          .setFooter({
            text: "Madokami Administration"
          })
          .setTimestamp()
      ],
      components: [adminMenu()]
    });
  }

  // ----------------------------------------------------------
  // 🔧 UTILIDAD
  // ----------------------------------------------------------

  if (command === "ping") {
    return message.reply(
      `🏓 Pong: **${client.ws.ping}ms**`
    );
  }

  if (command === "uptime") {
    const seconds = Math.floor(client.uptime / 1000);

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return message.reply(
      `⏱️ Uptime: **${hours}h ${minutes}m ${secs}s**`
    );
  }

  if (command === "botinfo" || command === "madokami") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle("🌸 Madokami")
          .setDescription(
            "Bot multipropósito para Discord."
          )
          .addFields(
            {
              name: "🌌 Prefijo",
              value: "`m!`",
              inline: true
            },
            {
              name: "🏠 Servidores",
              value: String(client.guilds.cache.size),
              inline: true
            },
            {
              name: "👥 Usuarios",
              value: String(client.users.cache.size),
              inline: true
            }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === "serverinfo" || command === "server") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`🏠 ${guild.name}`)
          .setThumbnail(
            guild.iconURL({ size: 1024 }) || null
          )
          .addFields(
            {
              name: "👥 Miembros",
              value: String(guild.memberCount),
              inline: true
            },
            {
              name: "💬 Canales",
              value: String(guild.channels.cache.size),
              inline: true
            },
            {
              name: "🎭 Roles",
              value: String(guild.roles.cache.size),
              inline: true
            },
            {
              name: "🆔 ID",
              value: guild.id
            }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === "userinfo") {
    const member =
      targetMember(message, args[0]) ||
      message.member;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(`👤 ${member.user.username}`)
          .setThumbnail(
            member.user.displayAvatarURL({
              size: 1024
            })
          )
          .addFields(
            {
              name: "🆔 ID",
              value: member.id,
              inline: true
            },
            {
              name: "🎭 Roles",
              value: String(
                Math.max(
                  0,
                  member.roles.cache.size - 1
                )
              ),
              inline: true
            },
            {
              name: "📅 Entró",
              value: member.joinedTimestamp
                ? `<t:${Math.floor(
                    member.joinedTimestamp / 1000
                  )}:R>`
                : "Desconocido",
              inline: true
            }
          )
          .setTimestamp()
      ]
    });
  }

  if (command === "avatar") {
    const member =
      targetMember(message, args[0]) ||
      message.member;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle(`🖼️ Avatar de ${member.user.username}`)
          .setImage(
            member.user.displayAvatarURL({
              size: 1024
            })
          )
      ]
    });
  }

  if (command === "servericon") {
    const icon = guild.iconURL({
      size: 1024
    });

    return message.reply(
      icon
        ? `🖼️ ${icon}`
        : "❌ Este servidor no tiene icono."
    );
  }

  if (command === "roles") {
    const roles = guild.roles.cache
      .filter(role => role.id !== guild.id)
      .map(role => `🎭 ${role.name}`)
      .join("\n");

    return message.reply(
      roles || "❌ No hay roles."
    );
  }

  if (command === "channels") {
    const channels = guild.channels.cache
      .map(channel =>
        `${channel.isTextBased() ? "💬" : "🔊"} ${channel.name}`
      )
      .join("\n");

    return message.reply(
      clean(channels) || "❌ No hay canales."
    );
  }

  if (command === "membercount") {
    return message.reply(
      `👥 Miembros: **${guild.memberCount}**`
    );
  }

  if (command === "channel") {
    return message.reply(
      `📌 Canal: **${message.channel.name}**\n` +
      `🆔 ID: \`${message.channel.id}\``
    );
  }

  if (command === "role" || command === "roleinfo") {
    const role = targetRole(guild, args.join(" "));

    if (!role) {
      return message.reply(
        "❌ No encontré ese rol."
      );
    }

    return message.reply(
      `🎭 **${role.name}**\n` +
      `🆔 ${role.id}\n` +
      `👥 Miembros: ${role.members.size}`
    );
  }

  if (command === "calc") {
    if (!raw) {
      return message.reply(
        "Uso: `m!calc 10 + 5`"
      );
    }

    const expression =
      raw.replace(
        /[^0-9+\-*/().% ]/g,
        ""
      );

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

  if (command === "choose") {
    if (args.length < 2) {
      return message.reply(
        "Uso: `m!choose opción1 | opción2 | opción3`"
      );
    }

    const options = raw
      .split("|")
      .map(x => x.trim())
      .filter(Boolean);

    return message.reply(
      `🎯 Elegí: **${
        options[random(0, options.length - 1)]
      }**`
    );
  }

  if (command === "random") {
    const min = Number(args[0]) || 1;
    const max = Number(args[1]) || 100;

    return message.reply(
      `🎲 Número aleatorio: **${random(min, max)}**`
    );
  }

  if (command === "reverse") {
    return message.reply(
      raw
        ? raw.split("").reverse().join("")
        : "Uso: `m!reverse texto`"
    );
  }

  if (command === "uppercase") {
    return message.reply(
      raw
        ? raw.toUpperCase()
        : "Uso: `m!uppercase texto`"
    );
  }

  if (command === "lowercase") {
    return message.reply(
      raw
        ? raw.toLowerCase()
        : "Uso: `m!lowercase texto`"
    );
  }

  if (command === "wordcount") {
    const words = raw
      ? raw.trim().split(/\s+/).length
      : 0;

    return message.reply(
      `📝 Palabras: **${words}**`
    );
  }

  if (command === "serverid") {
    return message.reply(
      `🆔 ID del servidor: \`${guild.id}\``
    );
  }

  if (command === "myid") {
    return message.reply(
      `🆔 Tu ID: \`${message.author.id}\``
    );
  }

  // ----------------------------------------------------------
  // 💰 ECONOMÍA
  // ----------------------------------------------------------

  if (
    [
      "balance",
      "wallet",
      "cash"
    ].includes(command)
  ) {
    return message.reply(
      `💰 Tu saldo es: **${money(user.balance)}**`
    );
  }

  if (command === "bank") {
    return message.reply(
      `🏦 Banco: **${money(user.bank)}**`
    );
  }

  if (command === "deposit") {
    const amount =
      args[0] === "all"
        ? user.balance
        : Number(args[0]);

    if (!amount || amount <= 0) {
      return message.reply(
        "Uso: `m!deposit <cantidad>`"
      );
    }

    if (amount > user.balance) {
      return message.reply(
        "❌ No tienes suficiente dinero."
      );
    }

    user.balance -= amount;
    user.bank += amount;
    save();

    return message.reply(
      `🏦 Depositaste **${money(amount)}**.`
    );
  }

  if (command === "withdraw") {
    const amount =
      args[0] === "all"
        ? user.bank
        : Number(args[0]);

    if (!amount || amount <= 0) {
      return message.reply(
        "Uso: `m!withdraw <cantidad>`"
      );
    }

    if (amount > user.bank) {
      return message.reply(
        "❌ No tienes suficiente dinero en el banco."
      );
    }

    user.bank -= amount;
    user.balance += amount;
    save();

    return message.reply(
      `🏦 Retiraste **${money(amount)}**.`
    );
  }

  if (command === "work") {
    const left =
      cooldown(user, "work", 30000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s** para trabajar otra vez.`
      );
    }

    const amount = random(100, 300);

    addMoney(user, amount);

    return message.reply(
      `💼 Trabajaste y ganaste **${money(amount)}**.`
    );
  }

  if (command === "daily") {
    const left =
      cooldown(user, "daily", 86400000);

    if (left) {
      return message.reply(
        `⏳ Ya reclamaste tu recompensa diaria.`
      );
    }

    const amount = random(500, 700);

    addMoney(user, amount);
    user.streak++;
    save();

    return message.reply(
      `🎁 Recompensa diaria: **${money(amount)}**\n` +
      `🔥 Racha: **${user.streak} días**`
    );
  }

  if (command === "weekly") {
    const left =
      cooldown(user, "weekly", 604800000);

    if (left) {
      return message.reply(
        `⏳ Ya reclamaste tu recompensa semanal.`
      );
    }

    const amount = random(1000, 1800);

    addMoney(user, amount);

    return message.reply(
      `🎁 Recompensa semanal: **${money(amount)}**`
    );
  }

  if (command === "job") {
    const left =
      cooldown(user, "job", 3600000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(250, 450);

    addMoney(user, amount);

    return message.reply(
      `💼 Cobraste tu trabajo: **${money(amount)}**`
    );
  }

  if (command === "salary") {
    const left =
      cooldown(user, "salary", 21600000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(800, 1200);

    addMoney(user, amount);

    return message.reply(
      `💵 Recibiste tu salario: **${money(amount)}**`
    );
  }

  if (command === "beg") {
    const left =
      cooldown(user, "beg", 120000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(40, 90);

    addMoney(user, amount);

    return message.reply(
      `🥺 Alguien te dio **${money(amount)}**.`
    );
  }

  if (command === "crime") {
    const left =
      cooldown(user, "crime", 120000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    if (Math.random() < 0.20) {
      const amount = random(500, 700);

      addMoney(user, amount);

      return message.reply(
        `🎭 Juego ficticio: ganaste **${money(amount)}**.`
      );
    }

    const loss = Math.min(
      user.balance,
      600
    );

    user.balance -= loss;
    save();

    return message.reply(
      `🎭 Juego ficticio: perdiste **${money(loss)}**.`
    );
  }

  if (command === "risk") {
    const left =
      cooldown(user, "risk", 60000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    if (Math.random() < 0.30) {
      const amount = random(300, 550);

      addMoney(user, amount);

      return message.reply(
        `🎲 ¡Ganaste! **+${money(amount)}**`
      );
    }

    const loss = Math.min(
      user.balance,
      random(300, 500)
    );

    user.balance -= loss;
    save();

    return message.reply(
      `🎲 Perdiste **${money(loss)}**.`
    );
  }

  if (command === "fish") {
    const left =
      cooldown(user, "fish", 60000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(80, 220);

    addMoney(user, amount);
    addItem(user, "pescado");

    return message.reply(
      `🎣 Pescaste un pescado y ganaste **${money(amount)}**.`
    );
  }

  if (command === "mine") {
    const left =
      cooldown(user, "mine", 90000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(100, 260);

    addMoney(user, amount);
    addItem(user, "mineral");

    return message.reply(
      `⛏️ Minaste minerales y ganaste **${money(amount)}**.`
    );
  }

  if (command === "farm") {
    const left =
      cooldown(user, "farm", 120000);

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount = random(120, 300);

    addMoney(user, amount);
    addItem(user, "semilla");

    return message.reply(
      `🌾 Trabajaste en la granja y ganaste **${money(amount)}**.`
    );
  }

  if (command === "inventory") {
    const items =
      Object.entries(user.inventory)
        .map(
          ([item, amount]) =>
            `📦 **${item}** × ${amount}`
        )
        .join("\n");

    return message.reply(
      items ||
      "🎒 Tu inventario está vacío."
    );
  }

  if (command === "shop") {
    return message.reply(
      "🛒 **Tienda**\n\n" +
      "🍎 comida — 100 💰\n" +
      "☕ cafe — 150 💰\n" +
      "🐟 pescado — 250 💰\n" +
      "⛏️ mineral — 300 💰\n" +
      "🪵 madera — 120 💰\n" +
      "🌱 semilla — 80 💰\n\n" +
      "Compra con `m!buy <objeto>`."
    );
  }

  if (command === "buy") {
    const prices = {
      comida: 100,
      cafe: 150,
      pescado: 250,
      mineral: 300,
      madera: 120,
      semilla: 80
    };

    const item =
      args[0]?.toLowerCase();

    if (!item || !prices[item]) {
      return message.reply(
        "❌ Ese objeto no existe."
      );
    }

    const price = prices[item];

    if (user.balance < price) {
      return message.reply(
        "❌ No tienes suficiente dinero."
      );
    }

    user.balance -= price;
    addItem(user, item);

    return message.reply(
      `🛒 Compraste **${item}** por **${money(price)}**.`
    );
  }

  if (command === "pay" || command === "give") {
    const target =
      targetMember(message, args[0]);

    const amount =
      Number(args[1]);

    if (!target || !amount || amount <= 0) {
      return message.reply(
        `Uso: \`${PREFIX}${command} @usuario cantidad\``
      );
    }

    if (target.id === message.author.id) {
      return message.reply(
        "❌ No puedes enviarte dinero a ti mismo."
      );
    }

    if (user.balance < amount) {
      return message.reply(
        "❌ No tienes suficiente dinero."
      );
    }

    const receiver =
      userData(guild.id, target.id);

    user.balance -= amount;
    receiver.balance += amount;

    save();

    return message.reply(
      `💸 Enviaste **${money(amount)}** a ${target}.`
    );
  }

  if (command === "leaderboard") {
    const ranking =
      Object.entries(
        db.users[guild.id] || {}
      )
        .sort(
          (a, b) =>
            (b[1].balance + b[1].bank) -
            (a[1].balance + a[1].bank)
        )
        .slice(0, 10);

    if (!ranking.length) {
      return message.reply(
        "📊 Todavía no hay datos."
      );
    }

    const text = ranking
      .map(
        ([id, data], index) =>
          `**${index + 1}.** <@${id}> — **${money(
            data.balance + data.bank
          )}**`
      )
      .join("\n");

    return message.reply(
      `🏆 **TOP DINERO**\n\n${text}`
    );
  }

  // ----------------------------------------------------------
  // 👥 SOCIAL
  // ----------------------------------------------------------

  if (command === "profile") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle(`🌸 Perfil de ${message.author.username}`)
          .setThumbnail(
            message.author.displayAvatarURL()
          )
          .addFields(
            {
              name: "💰 Dinero",
              value: money(user.balance),
              inline: true
            },
            {
              name: "⭐ Nivel",
              value: String(user.level),
              inline: true
            },
            {
              name: "✨ XP",
              value: String(user.xp),
              inline: true
            },
            {
              name: "❤️ Reputación",
              value: String(user.rep),
              inline: true
            },
            {
              name: "📝 Bio",
              value: user.bio || "Sin bio."
            }
          )
      ]
    });
  }

  if (command === "bio") {
    return message.reply(
      `📝 **Bio de ${message.author.username}:**\n` +
      `${user.bio || "Sin biografía."}`
    );
  }

  if (command === "setbio") {
    if (!raw) {
      return message.reply(
        "Uso: `m!setbio tu biografía`"
      );
    }

    user.bio = clean(raw, 500);
    save();

    return message.reply(
      "✅ Tu biografía fue actualizada."
    );
  }

  if (command === "rep") {
    const target =
      targetMember(message, args[0]);

    if (!target) {
      return message.reply(
        "Uso: `m!rep @usuario`"
      );
    }

    if (target.id === message.author.id) {
      return message.reply(
        "❌ No puedes darte reputación a ti mismo."
      );
    }

    const targetUser =
      userData(guild.id, target.id);

    targetUser.rep++;
    save();

    return message.reply(
      `❤️ ${target} ahora tiene **${targetUser.rep} rep**.`
    );
  }

  if (command === "level" || command === "xp") {
    return message.reply(
      `⭐ Nivel: **${user.level}**\n` +
      `✨ XP: **${user.xp}**`
    );
  }

  if (command === "afk" || command === "setafk") {
    user.afk = true;
    user.afkText =
      raw || "Estoy AFK.";

    save();

    return message.reply(
      `💤 AFK activado: **${user.afkText}**`
    );
  }

  if (command === "notes") {
    return message.reply(
      user.notes.length
        ? user.notes
            .map(
              (note, index) =>
                `**${index + 1}.** ${note}`
            )
            .join("\n")
        : "📝 No tienes notas."
    );
  }

  if (command === "note") {
    if (!raw) {
      return message.reply(
        "Uso: `m!note texto`"
      );
    }

    user.notes.push(
      clean(raw, 500)
    );

    save();

    return message.reply(
      "📝 Nota guardada."
    );
  }

  if (command === "clearnotes") {
    user.notes = [];
    save();

    return message.reply(
      "🧹 Notas borradas."
    );
  }

  // ----------------------------------------------------------
  // 🎮 DIVERSIÓN
  // ----------------------------------------------------------

  if (command === "8ball") {
    const answers = [
      "Sí.",
      "No.",
      "Probablemente.",
      "Definitivamente.",
      "No estoy seguro.",
      "Pregunta otra vez.",
      "Las estrellas dicen que sí.",
      "Las estrellas dicen que no."
    ];

    return message.reply(
      `🎱 ${answers[random(0, answers.length - 1)]}`
    );
  }

  if (command === "coinflip") {
    return message.reply(
      Math.random() < 0.5
        ? "🪙 **Cara**"
        : "🪙 **Cruz**"
    );
  }

  if (command === "dice") {
    return message.reply(
      `🎲 Resultado: **${random(1, 6)}**`
    );
  }

  if (command === "roll") {
    const match =
      /^(\d+)d(\d+)$/i.exec(
        args[0] || ""
      );

    if (!match) {
      return message.reply(
        "Uso: `m!roll 2d6`"
      );
    }

    const amount =
      Math.min(Number(match[1]), 20);

    const sides =
      Math.max(Number(match[2]), 2);

    let total = 0;

    for (let i = 0; i < amount; i++) {
      total += random(1, sides);
    }

    return message.reply(
      `🎲 Resultado: **${total}**`
    );
  }

  if (command === "rps") {
    const options = [
      "piedra",
      "papel",
      "tijera"
    ];

    return message.reply(
      `✊ Yo elijo **${
        options[random(0, 2)]
      }**.`
    );
  }

  if (
    command === "joke" ||
    command === "pun"
  ) {
    const jokes = [
      "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "😂 Mi código funciona. No preguntes por qué.",
      "😂 El servidor pidió un descanso.",
      "😂 Había una vez un bug... y se quedó."
    ];

    return message.reply(
      jokes[random(0, jokes.length - 1)]
    );
  }

  if (command === "compliment") {
    return message.reply(
      "🌟 ¡Tienes mucha creatividad!"
    );
  }

  if (command === "roast") {
    return message.reply(
      "🔥 Broma ligera: hasta el Wi-Fi necesita paciencia contigo."
    );
  }

  if (command === "fact") {
    return message.reply(
      "🧠 Dato: los pulpos tienen tres corazones."
    );
  }

  if (command === "fortune") {
    return message.reply(
      "🔮 Hoy podrías descubrir algo interesante."
    );
  }

  if (command === "scramble" || command === "anagram") {
    if (!raw) {
      return message.reply(
        "Uso: `m!scramble palabra`"
      );
    }

    return message.reply(
      `🔀 **${raw
        .split("")
        .sort(() => Math.random() - 0.5)
        .join("")}**`
    );
  }

  if (command === "mock") {
    if (!raw) {
      return message.reply(
        "Uso: `m!mock texto`"
      );
    }

    return message.reply(
      raw
        .split("")
        .map(
          (char, index) =>
            index % 2
              ? char.toUpperCase()
              : char.toLowerCase()
        )
        .join("")
    );
  }

  if (command === "riddle") {
    return message.reply(
      "🧩 ¿Qué tiene ciudades pero no casas, montañas pero no árboles y agua pero no peces?\n\n" +
      "Respuesta: un mapa."
    );
  }

  if (command === "wyr") {
    return message.reply(
      "🤔 ¿Qué prefieres?\n\n" +
      "A) Tener muchísimo dinero\n" +
      "B) Tener muchísimo tiempo libre"
    );
  }

  if (command === "trivia" || command === "quiz") {
    const questions = [
      {
        q: "¿Cuál es el planeta más grande del Sistema Solar?",
        a: "Júpiter"
      },
      {
        q: "¿Cuántos continentes hay tradicionalmente?",
        a: "7"
      },
      {
        q: "¿Cuál es la capital de Francia?",
        a: "París"
      }
    ];

    const question =
      questions[random(0, questions.length - 1)];

    return message.reply(
      `🎯 **TRIVIA**\n\n${question.q}\n\n` +
      `💡 Respuesta: **${question.a}**`
    );
  }

  // ----------------------------------------------------------
  // 🛡️ MODERACIÓN
  // ----------------------------------------------------------

  if (
    [
      "ban",
      "unban",
      "kick",
      "timeout",
      "untimeout",
      "mute",
      "unmute",
      "warn",
      "unwarn",
      "warnings",
      "clear",
      "purge",
      "slowmode",
      "lock",
      "unlock",
      "nick",
      "resetnick",
      "roleadd",
      "roleremove",
      "roleinfo",
      "channelinfo",
      "modstats"
    ].includes(command)
  ) {

    if (!hasPermission(
      message,
      PermissionsBitField.Flags.ManageMessages
    ) &&
    !isAdmin(message)) {
      return message.reply(
        "❌ Necesitas permisos de moderación."
      );
    }

    // BAN
    if (command === "ban") {
      const target =
        targetMember(message, args[0]);

      if (!target) {
        return message.reply(
          "Uso: `m!ban @usuario [razón]`"
        );
      }

      if (
        !target.bannable ||
        target.id === message.author.id
      ) {
        return message.reply(
          "❌ No puedo banear a ese usuario."
        );
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón";

      await target.ban({
        reason
      });

      await sendLog(
        guild,
        "🔨 Usuario baneado",
        `${target.user.tag}\nRazón: ${reason}\nPor: ${message.author.tag}`
      );

      return message.reply(
        `🔨 ${target.user.tag} fue baneado.`
      );
    }

    // UNBAN
    if (command === "unban") {
      const id =
        args[0]?.replace(/[<@!>]/g, "");

      if (!id) {
        return message.reply(
          "Uso: `m!unban ID`"
        );
      }

      try {
        await guild.members.unban(
          id,
          "Madokami"
        );

        await sendLog(
          guild,
          "🔓 Usuario desbaneado",
          `ID: ${id}\nPor: ${message.author.tag}`
        );

        return message.reply(
          `🔓 Usuario \`${id}\` desbaneado.`
        );
      } catch {
        return message.reply(
          "❌ No pude desbanear a ese usuario."
        );
      }
    }

    // KICK
    if (command === "kick") {
      const target =
        targetMember(message, args[0]);

      if (!target) {
        return message.reply(
          "Uso: `m!kick @usuario [razón]`"
        );
      }

      if (
        !target.kickable ||
        target.id === message.author.id
      ) {
        return message.reply(
          "❌ No puedo expulsar a ese usuario."
        );
      }

      await target.kick(
        args.slice(1).join(" ") ||
        "Madokami"
      );

      await sendLog(
        guild,
        "👢 Usuario expulsado",
        `${target.user.tag}\nPor: ${message.author.tag}`
      );

      return message.reply(
        `👢 ${target.user.tag} fue expulsado.`
      );
    }

    // TIMEOUT
    if (
      command === "timeout" ||
      command === "mute"
    ) {
      const target =
        targetMember(message, args[0]);

      const minutes =
        Number(args[1]) || 10;

      if (!target) {
        return message.reply(
          `Uso: \`m!${command} @usuario minutos\``
        );
      }

      if (!target.moderatable) {
        return message.reply(
          "❌ No puedo aplicar timeout."
        );
      }

      await target.timeout(
        Math.min(minutes, 40320) * 60000,
        "Madokami"
      );

      await sendLog(
        guild,
        "🔇 Timeout",
        `${target.user.tag}\nDuración: ${minutes} minutos\nPor: ${message.author.tag}`
      );

      return message.reply(
        `🔇 ${target.user.tag} recibió timeout durante **${minutes} minutos**.`
      );
    }

    // UNTIMEOUT / UNMUTE
    if (
      command === "untimeout" ||
      command === "unmute"
    ) {
      const target =
        targetMember(message, args[0]);

      if (!target) {
        return message.reply(
          `Uso: \`m!${command} @usuario\``
        );
      }

      await target.timeout(
        null,
        "Madokami"
      ).catch(() => {});

      return message.reply(
        `🔊 Timeout quitado a ${target}.`
      );
    }

    // WARN
    if (command === "warn") {
      const target =
        targetMember(message, args[0]);

      if (!target) {
        return message.reply(
          "Uso: `m!warn @usuario razón`"
        );
      }

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón";

      const targetData =
        userData(guild.id, target.id);

      targetData.warnings.push({
        reason,
        moderator: message.author.id,
        date: Date.now()
      });

      save();

      await sendLog(
        guild,
        "⚠️ Advertencia",
        `${target.user.tag}\nRazón: ${reason}\nPor: ${message.author.tag}`
      );

      return message.reply(
        `⚠️ ${target} recibió una advertencia.`
      );
    }

    // WARNINGS
    if (command === "warnings") {
      const target =
        targetMember(message, args[0]) ||
        message.member;

      const data =
        userData(guild.id, target.id);

      if (!data.warnings.length) {
        return message.reply(
          `⚠️ ${target.user.tag} no tiene advertencias.`
        );
      }

      const text =
        data.warnings
          .map(
            (warning, index) =>
              `**${index + 1}.** ${warning.reason}`
          )
          .join("\n");

      return message.reply(
        `⚠️ Advertencias de ${target.user.tag}\n\n${text}`
      );
    }

    // UNWARN
    if (command === "unwarn") {
      const target =
        targetMember(message, args[0]);

      const index =
        Number(args[1]) - 1;

      if (!target || index < 0) {
        return message.reply(
          "Uso: `m!unwarn @usuario número`"
        );
      }

      const data =
        userData(guild.id, target.id);

      if (!data.warnings[index]) {
        return message.reply(
          "❌ Esa advertencia no existe."
        );
      }

      data.warnings.splice(index, 1);
      save();

      return message.reply(
        "✅ Advertencia eliminada."
      );
    }

    // CLEAR / PURGE
    if (
      command === "clear" ||
      command === "purge"
    ) {
      const amount =
        Math.min(
          Math.max(Number(args[0]) || 10, 1),
          100
        );

      if (!message.channel.isTextBased()) {
        return;
      }

      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        ).catch(() => null);

      if (!deleted) {
        return message.reply(
          "❌ No pude borrar los mensajes."
        );
      }

      const response =
        await message.channel.send(
          `🧹 Borrados **${deleted.size}** mensajes.`
        );

      setTimeout(
        () => response.delete().catch(() => {}),
        5000
      );

      await sendLog(
        guild,
        "🧹 Mensajes eliminados",
        `Cantidad: ${deleted.size}\nPor: ${message.author.tag}`
      );

      return;
    }

    // SLOWMODE
    if (command === "slowmode") {
      const seconds =
        Math.min(
          Math.max(Number(args[0]) || 0, 0),
          21600
        );

      await message.channel.setRateLimitPerUser(
        seconds
      );

      return message.reply(
        `🐢 Slowmode establecido en **${seconds}s**.`
      );
    }

    // LOCK
    if (command === "lock") {
      await message.channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false
        }
      );

      await sendLog(
        guild,
        "🔒 Canal bloqueado",
        `Canal: ${message.channel.name}\nPor: ${message.author.tag}`
      );

      return message.reply(
        "🔒 Canal bloqueado."
      );
    }

    // UNLOCK
    if (command === "unlock") {
      await message.channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: null
        }
      );

      await sendLog(
        guild,
        "🔓 Canal desbloqueado",
        `Canal: ${message.channel.name}\nPor: ${message.author.tag}`
      );

      return message.reply(
        "🔓 Canal desbloqueado."
      );
    }

    // NICK
    if (command === "nick") {
      const target =
        targetMember(message, args[0]);

      const nickname =
        args.slice(1).join(" ");

      if (!target || !nickname) {
        return message.reply(
          "Uso: `m!nick @usuario nuevo_nombre`"
        );
      }

      await target.setNickname(
        nickname.slice(0, 32)
      );

      return message.reply(
        `🏷️ Apodo cambiado para ${target}.`
      );
    }

    // RESET NICK
    if (command === "resetnick") {
      const target =
        targetMember(message, args[0]);

      if (!target) {
        return message.reply(
          "Uso: `m!resetnick @usuario`"
        );
      }

      await target.setNickname(null);

      return message.reply(
        "🏷️ Apodo restablecido."
      );
    }

    // ROLE ADD
    if (command === "roleadd") {
      const target =
        targetMember(message, args[0]);

      const role =
        targetRole(
          guild,
          args.slice(1).join(" ")
        );

      if (!target || !role) {
        return message.reply(
          "Uso: `m!roleadd @usuario @rol`"
        );
      }

      await target.roles.add(role);

      return message.reply(
        `🎭 Rol ${role} añadido a ${target}.`
      );
    }

    // ROLE REMOVE
    if (command === "roleremove") {
      const target =
        targetMember(message, args[0]);

      const role =
        targetRole(
          guild,
          args.slice(1).join(" ")
        );

      if (!target || !role) {
        return message.reply(
          "Uso: `m!roleremove @usuario @rol`"
        );
      }

      await target.roles.remove(role);

      return message.reply(
        `🎭 Rol ${role} quitado a ${target}.`
      );
    }

    if (command === "channelinfo") {
      return message.reply(
        `📋 **${message.channel.name}**\n` +
        `🆔 ${message.channel.id}\n` +
        `📁 Tipo: ${message.channel.type}`
      );
    }

    if (command === "modstats") {
      return message.reply(
        `🛡️ **Moderación**\n\n` +
        `⚠️ Advertencias almacenadas: ${
          Object.values(db.users[guild.id] || {})
            .reduce(
              (total, u) =>
                total + (u.warnings?.length || 0),
              0
            )
        }`
      );
    }
  }

  // ----------------------------------------------------------
  // 👑 CONFIGURACIÓN
  // ----------------------------------------------------------

  if (command === "setup") {
    config.antiLink = true;
    config.antiSpam = true;

    save();

    return message.reply(
      "⚙️ **Configuración inicial completada.**\n\n" +
      "🔗 Anti-link: ON\n" +
      "🚨 Anti-spam: ON\n" +
      "📋 Usa `m!log #canal` para activar logs."
    );
  }

  if (command === "log") {
    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return message.reply(
        "Uso: `m!log #canal`"
      );
    }

    config.logChannel = channel.id;
    save();

    return message.reply(
      `📋 Logs configurados en ${channel}.`
    );
  }

  if (command === "logstatus") {
    return message.reply(
      config.logChannel
        ? `📋 Logs activos en <#${config.logChannel}>.`
        : "📋 Los logs están desactivados."
    );
  }

  if (command === "antilink") {
    const value =
      ["on", "true", "1"].includes(
        (args[0] || "").toLowerCase()
      );

    config.antiLink = value;
    save();

    return message.reply(
      `🔗 Anti-link: **${value ? "ON" : "OFF"}**`
    );
  }

  if (command === "antispam") {
    const value =
      ["on", "true", "1"].includes(
        (args[0] || "").toLowerCase()
      );

    config.antiSpam = value;
    save();

    return message.reply(
      `🚨 Anti-spam: **${value ? "ON" : "OFF"}**`
    );
  }

  if (command === "anticaps") {
    const value =
      ["on", "true", "1"].includes(
        (args[0] || "").toLowerCase()
      );

    config.antiCaps = value;
    save();

    return message.reply(
      `🔠 Anti-caps: **${value ? "ON" : "OFF"}**`
    );
  }

  if (command === "antimention") {
    const value =
      ["on", "true", "1"].includes(
        (args[0] || "").toLowerCase()
      );

    config.antiMention = value;
    save();

    return message.reply(
      `📣 Anti-mention: **${value ? "ON" : "OFF"}**`
    );
  }

  // WHITELIST
  if (command === "whitelist") {
    const target =
      targetMember(message, args[0]);

    if (!target) {
      return message.reply(
        "Uso: `m!whitelist @usuario`"
      );
    }

    if (config.whitelist.includes(target.id)) {
      config.whitelist =
        config.whitelist.filter(
          id => id !== target.id
        );

      save();

      return message.reply(
        `❌ ${target} eliminado de la whitelist.`
      );
    }

    config.whitelist.push(target.id);
    save();

    return message.reply(
      `✅ ${target} añadido a la whitelist.`
    );
  }

  // WELCOME
  if (command === "welcome") {
    const value =
      (args[0] || "").toLowerCase();

    if (
      !["on", "off"].includes(value)
    ) {
      return message.reply(
        "Uso: `m!welcome on` o `m!welcome off`"
      );
    }

    config.welcome.enabled =
      value === "on";

    save();

    return message.reply(
      `🌸 Bienvenida: **${
        config.welcome.enabled
          ? "ON"
          : "OFF"
      }**`
    );
  }

  if (command === "welcomechannel") {
    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return message.reply(
        "Uso: `m!welcomechannel #canal`"
      );
    }

    config.welcome.channel =
      channel.id;

    save();

    return message.reply(
      `🌸 Canal de bienvenida: ${channel}`
    );
  }

  if (command === "welcomemessage") {
    if (!raw) {
      return message.reply(
        "Uso: `m!welcomemessage mensaje`"
      );
    }

    config.welcome.message =
      raw.slice(0, 1000);

    save();

    return message.reply(
      "✅ Mensaje de bienvenida guardado.\n\n" +
      "Variables disponibles:\n" +
      "`{user}` `{server}` `{count}`"
    );
  }

  if (command === "testwelcome") {
    const text =
      config.welcome.message
        .replaceAll(
          "{user}",
          `<@${message.author.id}>`
        )
        .replaceAll(
          "{server}",
          guild.name
        )
        .replaceAll(
          "{count}",
          String(guild.memberCount)
        );

    return message.reply(text);
  }

  // GOODBYE
  if (command === "goodbye") {
    const value =
      (args[0] || "").toLowerCase();

    if (
      !["on", "off"].includes(value)
    ) {
      return message.reply(
        "Uso: `m!goodbye on` o `m!goodbye off`"
      );
    }

    config.goodbye.enabled =
      value === "on";

    save();

    return message.reply(
      `👋 Despedida: **${
        config.goodbye.enabled
          ? "ON"
          : "OFF"
      }**`
    );
  }

  if (command === "goodbyechannel") {
    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return message.reply(
        "Uso: `m!goodbyechannel #canal`"
      );
    }

    config.goodbye.channel =
      channel.id;

    save();

    return message.reply(
      `👋 Canal de despedida: ${channel}`
    );
  }

  if (command === "goodbyemessage") {
    if (!raw) {
      return message.reply(
        "Uso: `m!goodbyemessage mensaje`"
      );
    }

    config.goodbye.message =
      raw.slice(0, 1000);

    save();

    return message.reply(
      "✅ Mensaje de despedida guardado."
    );
  }

  // AUTOROLE
  if (command === "autorole") {
    const role =
      targetRole(
        guild,
        args.join(" ")
      );

    if (!role) {
      config.autorole = null;
      save();

      return message.reply(
        "👥 Autorole desactivado."
      );
    }

    config.autorole = role.id;
    save();

    return message.reply(
      `👥 Autorole configurado: ${role}`
    );
  }

  // SAY
  if (command === "say") {
    if (!raw) {
      return message.reply(
        "Uso: `m!say mensaje`"
      );
    }

    await message.delete().catch(() => {});

    return message.channel.send({
      content: raw,
      allowedMentions: {
        parse: []
      }
    });
  }

  // ANNOUNCE
  if (command === "announce") {
    if (!raw) {
      return message.reply(
        "Uso: `m!announce mensaje`"
      );
    }

    const embed =
      new EmbedBuilder()
        .setColor(0xff69b4)
        .setTitle("📢 ANUNCIO")
        .setDescription(clean(raw))
        .setFooter({
          text: `Madokami • ${guild.name}`
        })
        .setTimestamp();

    return message.channel.send({
      embeds: [embed]
    });
  }

  // AUTO REPLY
  if (command === "autoreplyadd") {
    const separator =
      raw.indexOf("|");

    if (separator === -1) {
      return message.reply(
        "Uso: `m!autoreplyadd palabra | respuesta`"
      );
    }

    const trigger =
      raw.slice(0, separator).trim();

    const response =
      raw.slice(separator + 1).trim();

    if (!trigger || !response) {
      return message.reply(
        "❌ Datos inválidos."
      );
    }

    config.autoReplies.push({
      trigger: trigger.toLowerCase(),
      response
    });

    save();

    return message.reply(
      "✅ Autorespuesta añadida."
    );
  }

  if (command === "autoreplylist") {
    if (!config.autoReplies.length) {
      return message.reply(
        "📭 No hay autorespuestas."
      );
    }

    return message.reply(
      config.autoReplies
        .map(
          (item, index) =>
            `**${index + 1}.** ${item.trigger} → ${item.response}`
        )
        .join("\n")
    );
  }

  if (command === "autoreplydel") {
    const index =
      Number(args[0]) - 1;

    if (!config.autoReplies[index]) {
      return message.reply(
        "❌ Índice inválido."
      );
    }

    config.autoReplies.splice(
      index,
      1
    );

    save();

    return message.reply(
      "🗑️ Autorespuesta eliminada."
    );
  }

  // AUTO REACT
  if (command === "autoreactadd") {
    const separator =
      raw.indexOf("|");

    if (separator === -1) {
      return message.reply(
        "Uso: `m!autoreactadd palabra | emoji`"
      );
    }

    const trigger =
      raw.slice(0, separator).trim();

    const emoji =
      raw.slice(separator + 1).trim();

    config.autoReactions.push({
      trigger: trigger.toLowerCase(),
      emoji
    });

    save();

    return message.reply(
      "✅ Reacción automática añadida."
    );
  }

  if (command === "autoreactlist") {
    if (!config.autoReactions.length) {
      return message.reply(
        "📭 No hay reacciones automáticas."
      );
    }

    return message.reply(
      config.autoReactions
        .map(
          (item, index) =>
            `**${index + 1}.** ${item.trigger} → ${item.emoji}`
        )
        .join("\n")
    );
  }

  if (command === "autoreactdel") {
    const index =
      Number(args[0]) - 1;

    if (!config.autoReactions[index]) {
      return message.reply(
        "❌ Índice inválido."
      );
    }

    config.autoReactions.splice(
      index,
      1
    );

    save();

    return message.reply(
      "🗑️ Reacción automática eliminada."
    );
  }

  // STATUS
  if (command === "status") {
    const status =
      raw || "m!help";

    config.botStatus =
      status.slice(0, 128);

    client.user.setActivity(
      config.botStatus
    );

    save();

    return message.reply(
      "✅ Estado del bot actualizado."
    );
  }

  // SETTINGS
  if (command === "settings") {
    return message.reply(
      `⚙️ **Configuración de ${guild.name}**\n\n` +
      `🔗 Anti-link: ${config.antiLink ? "ON" : "OFF"}\n` +
      `🚨 Anti-spam: ${config.antiSpam ? "ON" : "OFF"}\n` +
      `🔠 Anti-caps: ${config.antiCaps ? "ON" : "OFF"}\n` +
      `📣 Anti-mention: ${config.antiMention ? "ON" : "OFF"}\n` +
      `🌸 Welcome: ${config.welcome.enabled ? "ON" : "OFF"}\n` +
      `👋 Goodbye: ${config.goodbye.enabled ? "ON" : "OFF"}\n` +
      `📋 Logs: ${config.logChannel ? "ON" : "OFF"}`
    );
  }

  if (command === "logtest") {
    await sendLog(
      guild,
      "🧪 Prueba de logs",
      `Prueba realizada por ${message.author.tag}.`
    );

    return message.reply(
      "🧪 Prueba enviada a los logs."
    );
  }

  if (command === "security") {
    return message.reply(
      `🛡️ **Seguridad**\n\n` +
      `🔗 Anti-link: ${config.antiLink ? "🟢" : "🔴"}\n` +
      `🚨 Anti-spam: ${config.antiSpam ? "🟢" : "🔴"}\n` +
      `🔠 Anti-caps: ${config.antiCaps ? "🟢" : "🔴"}\n` +
      `📣 Anti-mention: ${config.antiMention ? "🟢" : "🔴"}\n` +
      `👤 Whitelist: ${config.whitelist.length}`
    );
  }

  // ----------------------------------------------------------
  // ❌ DESCONOCIDO
  // ----------------------------------------------------------

  return message.reply(
    `❌ El comando \`${PREFIX}${command}\` no existe.\n` +
    `Usa \`${PREFIX}help\`.`
  );
}

// ============================================================
// 💬 MENSAJES
// ============================================================

const spamTracker = new Map();

client.on(
  "messageCreate",
  async message => {

    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    const guild =
      message.guild;

    const config =
      guildData(guild.id);

    const user =
      userData(
        guild.id,
        message.author.id
      );

    // --------------------------------------------------------
    // 💤 QUITAR AFK
    // --------------------------------------------------------

    if (
      user.afk &&
      !message.content.startsWith(PREFIX)
    ) {
      user.afk = false;
      user.afkText = "";

      save();
    }

    // --------------------------------------------------------
    // 🛡️ SEGURIDAD
    // --------------------------------------------------------

    if (
      !message.content.startsWith(PREFIX) &&
      !isWhitelisted(
        guild.id,
        message.author.id
      ) &&
      !isAdmin(message)
    ) {

      const key =
        `${guild.id}:${message.author.id}`;

      const now =
        Date.now();

      const timestamps =
        (
          spamTracker.get(key) || []
        ).filter(
          time => now - time < 7000
        );

      timestamps.push(now);

      spamTracker.set(
        key,
        timestamps
      );

      // ANTI-SPAM
      if (
        config.antiSpam &&
        timestamps.length > 5
      ) {

        spamTracker.set(
          key,
          []
        );

        await message.delete()
          .catch(() => {});

        await sendLog(
          guild,
          "🚨 Anti-spam",
          `Usuario: ${message.author.tag}\n` +
          `Acción: mensaje eliminado.`
        );

        return;
      }

      // ANTI-LINK
      if (
        config.antiLink &&
        /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i
          .test(message.content)
      ) {

        await message.delete()
          .catch(() => {});

        let timedOut = false;

        if (message.member?.moderatable) {
          timedOut =
            await message.member
              .timeout(
                2 * 60 * 60 * 1000,
                "Madokami Anti-link"
              )
              .then(() => true)
              .catch(() => false);
        }

        const warning =
          await message.channel
            .send(
              `🔗 <@${message.author.id}> no puedes enviar enlaces aquí.` +
              (timedOut
                ? "\n⏱️ Timeout aplicado durante **2 horas**."
                : "")
            )
            .catch(() => null);

        if (warning) {
          setTimeout(
            () =>
              warning
                .delete()
                .catch(() => {}),
            5000
          );
        }

        await sendLog(
          guild,
          "🔗 Anti-link",
          `Usuario: ${message.author.tag}\n` +
          `Timeout: ${timedOut ? "Sí" : "No"}`
        );

        return;
      }

      // ANTI-CAPS
      if (
        config.antiCaps &&
        message.content.length >= 12
      ) {

        const letters =
          message.content.replace(
            /[^a-zA-ZÁÉÍÓÚáéíóúÑñ]/g,
            ""
          );

        const upper =
          letters.replace(
            /[^A-ZÁÉÍÓÚÑ]/g,
            ""
          );

        if (
          letters.length >= 8 &&
          upper.length / letters.length >= 0.8
        ) {

          await message.delete()
            .catch(() => {});

          return;
        }
      }

      // ANTI-MENTION
      if (
        config.antiMention &&
        message.mentions.users.size >= 5
      ) {

        await message.delete()
          .catch(() => {});

        return;
      }

      // AUTO RESPUESTAS
      for (
        const reply of config.autoReplies
      ) {

        if (
          message.content
            .toLowerCase()
            .includes(reply.trigger)
        ) {

          await message.channel
            .send(reply.response)
            .catch(() => {});

          break;
        }
      }

      // AUTO REACCIONES
      for (
        const reaction of config.autoReactions
      ) {

        if (
          message.content
            .toLowerCase()
            .includes(reaction.trigger)
        ) {

          await message.react(
            reaction.emoji
          ).catch(() => {});
        }
      }

      // XP
      if (Math.random() < 0.08) {

        user.xp += 5;

        const needed =
          user.level * 100;

        if (user.xp >= needed) {

          user.xp -= needed;
          user.level++;

          const levelMessage =
            await message.channel
              .send(
                `⭐ <@${message.author.id}> subió al nivel **${user.level}**.`
              )
              .catch(() => null);

          if (levelMessage) {
            setTimeout(
              () =>
                levelMessage
                  .delete()
                  .catch(() => {}),
              5000
            );
          }
        }

        save();
      }
    }

    // --------------------------------------------------------
    // 📌 COMANDO
    // --------------------------------------------------------

    if (
      !message.content.startsWith(PREFIX)
    ) {
      return;
    }

    const body =
      message.content
        .slice(PREFIX.length)
        .trim();

    if (!body) {
      return;
    }

    const parts =
      body.split(/\s+/);

    const command =
      parts.shift()
        .toLowerCase();

    const raw =
      body
        .slice(command.length)
        .trim();

    // HELPAD no necesita estar dentro del mapa
    if (
      command !== "helpad" &&
      !COMMANDS.has(command)
    ) {
      return message.reply(
        `❌ Comando desconocido. Usa \`${PREFIX}help\`.`
      );
    }

    try {
      await executeCommand(
        message,
        command,
        parts,
        raw
      );
    } catch (error) {

      console.error(
        `❌ Error en ${command}:`,
        error
      );

      await message.reply(
        "❌ Ocurrió un error ejecutando el comando."
      ).catch(() => {});
    }
  }
);

// ============================================================
// 🌸 INTERACCIONES DEL MENÚ
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isStringSelectMenu()
    ) {
      return;
    }

    if (
      interaction.customId ===
      "madokami_help_menu"
    ) {

      const category =
        interaction.values[0];

      return interaction.update({
        embeds: [
          commandEmbed(
            category,
            0
          )
        ],
        components: [
          helpMenu()
        ]
      });
    }

    if (
      interaction.customId ===
      "madokami_admin_menu"
    ) {

      if (
        !interaction.memberPermissions
          ?.has(
            PermissionsBitField.Flags.Administrator
          )
      ) {
        return interaction.reply({
          content:
            "❌ Solo administradores.",
          ephemeral: true
        });
      }

      const category =
        interaction.values[0];

      const data =
        ADMIN_CATEGORIES[category];

      const text =
        data.commands
          .map(
            ([command, description], index) =>
              `**${index + 1}.** \`${PREFIX}${command}\` — ${description}`
          )
          .join("\n");

      return interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(data.color)
            .setTitle(
              `${data.name} • Administración`
            )
            .setDescription(text)
            .setFooter({
              text: "Madokami Administration"
            })
            .setTimestamp()
        ],
        components: [
          adminMenu()
        ]
      });
    }
  }
);

// ============================================================
// 👋 BIENVENIDA
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const config =
      guildData(member.guild.id);

    // AUTOROLE
    if (config.autorole) {

      const role =
        member.guild.roles.cache.get(
          config.autorole
        );

      if (role) {
        await member.roles
          .add(role)
          .catch(() => {});
      }
    }

    // WELCOME
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
              String(
                member.guild.memberCount
              )
            );

        await channel
          .send(text)
          .catch(() => {});
      }
    }

    await sendLog(
      member.guild,
      "👋 Miembro entró",
      `${member.user.tag} (${member.id})`
    );
  }
);

// ============================================================
// 👋 DESPEDIDA
// ============================================================

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
              member.user?.tag ||
                member.id
            )
            .replaceAll(
              "{server}",
              member.guild.name
            )
            .replaceAll(
              "{count}",
              String(
                member.guild.memberCount
              )
            );

        await channel
          .send(text)
          .catch(() => {});
      }
    }

    await sendLog(
      member.guild,
      "👋 Miembro salió",
      `${member.user?.tag || member.id}`
    );
  }
);

// ============================================================
// 📝 MENSAJES ELIMINADOS
// ============================================================

client.on(
  "messageDelete",
  async message => {

    if (
      !message.guild ||
      message.author?.bot
    ) {
      return;
    }

    await sendLog(
      message.guild,
      "🗑️ Mensaje eliminado",
      `Autor: ${message.author?.tag || "Desconocido"}\n` +
      `Canal: #${message.channel?.name || "desconocido"}\n` +
      `Contenido: ${message.content || "[sin contenido en caché]"}`
    );
  }
);

// ============================================================
// ✏️ MENSAJES EDITADOS
// ============================================================

client.on(
  "messageUpdate",
  async (oldMessage, newMessage) => {

    if (
      !newMessage.guild ||
      newMessage.author?.bot ||
      oldMessage.content ===
        newMessage.content
    ) {
      return;
    }

    await sendLog(
      newMessage.guild,
      "✏️ Mensaje editado",
      `Autor: ${newMessage.author?.tag || "Desconocido"}\n\n` +
      `Antes:\n${oldMessage.content || "[sin caché]"}\n\n` +
      `Después:\n${newMessage.content || "[sin caché]"}`
    );
  }
);

// ============================================================
// 🎭 ROLES
// ============================================================

client.on(
  "roleCreate",
  role =>
    sendLog(
      role.guild,
      "🎭 Rol creado",
      `Rol: ${role.name}\nID: ${role.id}`
    )
);

client.on(
  "roleDelete",
  role =>
    sendLog(
      role.guild,
      "🗑️ Rol eliminado",
      `Rol: ${role.name}\nID: ${role.id}`
    )
);

// ============================================================
// 📁 CANALES
// ============================================================

client.on(
  "channelCreate",
  channel => {

    if (!channel.guild) return;

    sendLog(
      channel.guild,
      "📁 Canal creado",
      `Canal: ${channel.name}\nID: ${channel.id}`
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
      `Canal: ${channel.name}\nID: ${channel.id}`
    );
  }
);

// ============================================================
// 🎭 REACTION ROLES
// ============================================================

client.on(
  "messageReactionAdd",
  async (reaction, user) => {

    if (
      user.bot ||
      !reaction.message.guild
    ) {
      return;
    }

    const config =
      guildData(
        reaction.message.guild.id
      );

    const emoji =
      reaction.emoji.name ||
      reaction.emoji.toString();

    const key =
      `${reaction.message.id}:${emoji}`;

    const roleId =
      config.reactionRoles[key];

    if (!roleId) return;

    const member =
      await reaction.message.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) return;

    await member.roles
      .add(roleId)
      .catch(() => {});
  }
);

client.on(
  "messageReactionRemove",
  async (reaction, user) => {

    if (
      user.bot ||
      !reaction.message.guild
    ) {
      return;
    }

    const config =
      guildData(
        reaction.message.guild.id
      );

    const emoji =
      reaction.emoji.name ||
      reaction.emoji.toString();

    const key =
      `${reaction.message.id}:${emoji}`;

    const roleId =
      config.reactionRoles[key];

    if (!roleId) return;

    const member =
      await reaction.message.guild.members
        .fetch(user.id)
        .catch(() => null);

    if (!member) return;

    await member.roles
      .remove(roleId)
      .catch(() => {});
  }
);

// ============================================================
// 🚫 ERRORES
// ============================================================

client.on(
  "error",
  error => {
    console.error(
      "❌ Discord Client Error:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "❌ Unhandled Rejection:",
      error
    );
  }
);

// ============================================================
// 🚀 READY
// ============================================================

client.once(
  "ready",
  () => {

    console.log(
      "======================================"
    );

    console.log(
      `🌸 MADOKAMI CONECTADO COMO ${client.user.tag}`
    );

    console.log(
      `🌌 Prefijo: ${PREFIX}`
    );

    console.log(
      `🏠 Servidores: ${client.guilds.cache.size}`
    );

    console.log(
      "======================================"
    );

    client.user.setActivity(
      "m!help"
    );
  }
);

// ============================================================
// 🔑 LOGIN
// ============================================================

if (!process.env.DISCORD_TOKEN) {

  console.error(
    "❌ FALTA DISCORD_TOKEN EN LAS VARIABLES DE RENDER."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
);
