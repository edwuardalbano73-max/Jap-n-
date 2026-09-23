// ============================================================
// 🌸 MADOKAMI — DISCORD BOT
// Prefix: m!
// discord.js v14
// ============================================================

const {
  Client,
  GatewayIntentBits,
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
  ]
});

// ============================================================
// 🌐 RENDER
// ============================================================

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
  console.log(`🌐 Servidor web activo en ${PORT}`);
});

// ============================================================
// 💾 DATABASE
// ============================================================

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
  } catch (error) {
    console.error("Error guardando DB:", error);
  }
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
      autoReactions: [],

      stats: {
        messages: 0,
        joins: 0,
        leaves: 0
      }
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

      achievements: [],

      stats: {
        messages: 0,
        commands: 0,
        games: 0,
        earned: 0
      },

      cooldowns: {}
    };
  }

  return db.users[guildId][userId];
}

// ============================================================
// 🎨 HELPERS
// ============================================================

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

async function reply(
  message,
  title,
  description,
  color = COLORS.pink
) {
  return message.reply({
    embeds: [
      embed(title, description, color)
    ]
  });
}

function clean(text, max = 1900) {
  return String(text || "")
    .replace(/@everyone/gi, "@\u200beveryone")
    .replace(/@here/gi, "@\u200bhere")
    .slice(0, max);
}

function isAdmin(message) {
  return Boolean(
    message.member?.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function isModerator(message) {
  return (
    isAdmin(message) ||
    Boolean(
      message.member?.permissions.has(
        PermissionsBitField.Flags.ManageMessages
      )
    ) ||
    Boolean(
      message.member?.permissions.has(
        PermissionsBitField.Flags.ModerateMembers
      )
    )
  );
}

function targetMember(message, arg) {
  if (!arg || !message.guild) return null;

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
      role =>
        role.name.toLowerCase() ===
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
        title,
        clean(description, 3900),
        color
      )
    ]
  }).catch(() => {});
}

function addXP(guildId, userId, amount) {
  const user = userData(guildId, userId);

  user.xp += amount;

  let leveled = false;

  while (user.xp >= user.level * 100) {
    user.xp -= user.level * 100;
    user.level++;
    leveled = true;
  }

  save();

  return leveled;
}

function money(user, amount) {
  user.balance += amount;

  if (amount > 0) {
    user.stats.earned += amount;
  }

  save();
}

// ============================================================
// 📚 CATEGORÍAS — EXACTAMENTE 50 CADA UNA
// ============================================================

const CATEGORIES = {

  economy: {
    name: "💰 Economía",
    color: COLORS.gold,
    commands: [
      ["balance", "Ver tu dinero"],
      ["wallet", "Ver tu cartera"],
      ["bank", "Ver tu banco"],
      ["work", "Trabajar"],
      ["daily", "Recompensa diaria"],
      ["weekly", "Recompensa semanal"],
      ["monthly", "Recompensa mensual"],
      ["bonus", "Bono"],
      ["earn", "Formas de ganar"],
      ["crime", "Intentar ganar dinero"],
      ["risk", "Juego de riesgo"],
      ["deposit", "Depositar dinero"],
      ["withdraw", "Retirar dinero"],
      ["pay", "Pagar a un usuario"],
      ["give", "Dar dinero"],
      ["shop", "Ver tienda"],
      ["buy", "Comprar"],
      ["sell", "Vender"],
      ["inventory", "Ver inventario"],
      ["item", "Ver objeto"],
      ["leaderboard", "Ranking de dinero"],
      ["topcoins", "Top de monedas"],
      ["economy", "Información económica"],
      ["beg", "Pedir dinero"],
      ["fish", "Pescar"],
      ["hunt", "Buscar recompensa"],
      ["dig", "Excavar"],
      ["forage", "Recolectar"],
      ["job", "Realizar trabajo"],
      ["salary", "Cobrar salario"],
      ["tip", "Dar propina"],
      ["steal", "Intentar robar monedas virtuales"],
      ["jackpot", "Jackpot virtual"],
      ["coin", "Ver moneda"],
      ["cash", "Ver efectivo"],
      ["rich", "Ver dinero total"],
      ["networth", "Ver patrimonio"],
      ["transfer", "Transferir dinero"],
      ["save", "Guardar dinero"],
      ["spend", "Ver gasto"],
      ["income", "Ver ingresos"],
      ["depositall", "Depositar todo"],
      ["withdrawall", "Retirar todo"],
      ["payall", "Pago rápido"],
      ["moneyrank", "Ranking económico"],
      ["earning", "Ver ganancias"],
      ["pocket", "Ver bolsillo"],
      ["financial", "Resumen financiero"],
      ["economyhelp", "Ayuda económica"]
    ]
  },

  moderation: {
    name: "🛡️ Moderación",
    color: COLORS.red,
    commands: [
      ["ban", "Banear usuario"],
      ["unban", "Desbanear usuario"],
      ["kick", "Expulsar usuario"],
      ["mute", "Silenciar 2 horas"],
      ["unmute", "Quitar silencio"],
      ["timeout", "Aplicar timeout"],
      ["untimeout", "Quitar timeout"],
      ["warn", "Advertir usuario"],
      ["unwarn", "Quitar advertencia"],
      ["warnings", "Ver advertencias"],
      ["clear", "Eliminar mensajes"],
      ["purge", "Limpiar mensajes"],
      ["slowmode", "Configurar slowmode"],
      ["lock", "Bloquear canal"],
      ["unlock", "Desbloquear canal"],
      ["nick", "Cambiar apodo"],
      ["resetnick", "Restablecer apodo"],
      ["roleadd", "Dar rol"],
      ["roleremove", "Quitar rol"],
      ["roleinfo", "Información de rol"],
      ["userinfo", "Información de usuario"],
      ["membercount", "Contar miembros"],
      ["channelinfo", "Información de canal"],
      ["serverinfo", "Información del servidor"],
      ["permissions", "Ver permisos"],
      ["modlog", "Ver configuración de logs"],
      ["reason", "Mostrar formato de razón"],
      ["baninfo", "Información de ban"],
      ["kickinfo", "Información de kick"],
      ["muteinfo", "Información de mute"],
      ["warninfo", "Información de warn"],
      ["clearinfo", "Ayuda de clear"],
      ["lockinfo", "Ayuda de lock"],
      ["unlockinfo", "Ayuda de unlock"],
      ["slowinfo", "Ayuda de slowmode"],
      ["roleaddinfo", "Ayuda de roleadd"],
      ["roleremoveinfo", "Ayuda de roleremove"],
      ["moderation", "Resumen de moderación"],
      ["modhelp", "Ayuda de moderación"],
      ["staff", "Ver moderadores"],
      ["mods", "Ver moderadores"],
      ["admins", "Ver administradores"],
      ["serverowner", "Ver propietario"],
      ["hierarchy", "Ver jerarquía"],
      ["roles", "Ver roles"],
      ["channels", "Ver canales"],
      ["audit", "Información de auditoría"],
      ["modstats", "Estadísticas de moderación"]
    ]
  },

  utility: {
    name: "🔧 Utilidad",
    color: COLORS.blue,
    commands: [
      ["ping", "Ver latencia"],
      ["uptime", "Ver tiempo activo"],
      ["botinfo", "Información del bot"],
      ["serverinfo", "Información del servidor"],
      ["userinfo", "Información de usuario"],
      ["avatar", "Ver avatar"],
      ["servericon", "Ver icono"],
      ["roles", "Lista de roles"],
      ["channels", "Lista de canales"],
      ["membercount", "Cantidad de miembros"],
      ["channel", "Información de canal"],
      ["channelinfo", "Información de canal"],
      ["role", "Información de rol"],
      ["roleinfo", "Información de rol"],
      ["emoji", "Información de emoji"],
      ["emojis", "Lista de emojis"],
      ["stickers", "Lista de stickers"],
      ["calc", "Calculadora"],
      ["choose", "Elegir opción"],
      ["random", "Número aleatorio"],
      ["reverse", "Invertir texto"],
      ["uppercase", "Mayúsculas"],
      ["lowercase", "Minúsculas"],
      ["length", "Longitud de texto"],
      ["wordcount", "Contar palabras"],
      ["date", "Fecha actual"],
      ["time", "Hora actual"],
      ["id", "Tu ID"],
      ["myid", "Tu ID"],
      ["serverid", "ID del servidor"],
      ["guildid", "ID del servidor"],
      ["permissions", "Tus permisos"],
      ["member", "Buscar miembro"],
      ["owner", "Ver dueño"],
      ["created", "Fecha de creación"],
      ["joined", "Fecha de entrada"],
      ["botstatus", "Estado del bot"],
      ["status", "Estado"],
      ["invite", "Información de invitación"],
      ["prefix", "Ver prefijo"],
      ["prefixinfo", "Información del prefijo"],
      ["utility", "Resumen de utilidad"],
      ["tools", "Herramientas"],
      ["helpme", "Ayuda rápida"],
      ["server", "Servidor"],
      ["online", "Miembros online"],
      ["rolelist", "Lista de roles"],
      ["channellist", "Lista de canales"],
      ["utilityhelp", "Ayuda de utilidad"]
    ]
  },

  fun: {
    name: "🎮 Diversión",
    color: COLORS.purple,
    commands: [
      ["8ball", "Bola 8"],
      ["coinflip", "Cara o cruz"],
      ["dice", "Tirar dado"],
      ["roll", "Tirar dados"],
      ["rps", "Piedra papel tijera"],
      ["trivia", "Trivia"],
      ["guess", "Adivinar número"],
      ["joke", "Chiste"],
      ["compliment", "Cumplido"],
      ["roast", "Broma"],
      ["fact", "Dato curioso"],
      ["fortune", "Fortuna"],
      ["quote", "Frase"],
      ["riddle", "Acertijo"],
      ["wyr", "Qué prefieres"],
      ["ascii", "Texto decorado"],
      ["mock", "Texto burlón"],
      ["reversewords", "Invertir palabras"],
      ["shuffle", "Mezclar texto"],
      ["funfact", "Dato divertido"],
      ["randomfact", "Dato aleatorio"],
      ["yesno", "Sí o no"],
      ["pick", "Elegir opción"],
      ["number", "Número aleatorio"],
      ["higher", "Mayor"],
      ["lower", "Menor"],
      ["quiz", "Quiz"],
      ["math", "Reto matemático"],
      ["word", "Palabra"],
      ["scramble", "Palabra mezclada"],
      ["anagram", "Anagrama"],
      ["memory", "Memoria"],
      ["sequence", "Secuencia"],
      ["reaction", "Reacción"],
      ["challenge", "Desafío"],
      ["randomgame", "Juego aleatorio"],
      ["luck", "Suerte"],
      ["fortune2", "Fortuna rápida"],
      ["magic", "Respuesta mágica"],
      ["sayfun", "Repetir texto"],
      ["emoji", "Emoji aleatorio"],
      ["emojify", "Convertir a emojis"],
      ["color", "Color aleatorio"],
      ["numbergame", "Juego numérico"],
      ["dicegame", "Juego de dados"],
      ["wordgame", "Juego de palabras"],
      ["fun", "Modo diversión"],
      ["games", "Lista de juegos"],
      ["funhelp", "Ayuda de diversión"]
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
      ["myid", "Ver ID"],
      ["social", "Información social"],
      ["userinfo", "Perfil de usuario"],
      ["user", "Buscar usuario"],
      ["friends", "Información social"],
      ["reputation", "Ver reputación"],
      ["giveRep", "Dar reputación"],
      ["rankcard", "Tarjeta de rango"],
      ["levelcard", "Tarjeta de nivel"],
      ["xpinfo", "Información de XP"],
      ["levelinfo", "Información de nivel"],
      ["activity", "Actividad"],
      ["myactivity", "Mi actividad"],
      ["messagecount", "Mensajes enviados"],
      ["messages", "Tus mensajes"],
      ["joined", "Fecha de entrada"],
      ["roles", "Tus roles"],
      ["avatar", "Avatar"],
      ["socialinfo", "Resumen social"],
      ["aboutme", "Sobre mí"],
      ["setabout", "Configurar descripción"],
      ["clearbio", "Borrar biografía"],
      ["clearaFk", "Desactivar AFK"],
      ["afkinfo", "Información AFK"],
      ["birthdayinfo", "Información de cumpleaños"],
      ["notelist", "Lista de notas"],
      ["addnote", "Añadir nota"],
      ["removenote", "Eliminar nota"],
      ["socialrank", "Ranking social"],
      ["repleaderboard", "Ranking de reputación"],
      ["socialhelp", "Ayuda social"],
      ["userinfo2", "Datos del usuario"]
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
      ["claim", "Reclamar premio"],
      ["bonus", "Bono"],
      ["gift", "Regalo"],
      ["gifts", "Regalos"],
      ["achievement", "Logro"],
      ["achievements", "Logros"],
      ["milestone", "Hito"],
      ["milestones", "Hitos"],
      ["levelup", "Información de subida"],
      ["rankcard", "Tarjeta de rango"],
      ["quest", "Misión"],
      ["quests", "Misiones"],
      ["mission", "Misión"],
      ["missions", "Misiones"],
      ["prize", "Premio"],
      ["trophy", "Trofeo"],
      ["badges", "Insignias"],
      ["badge", "Insignia"],
      ["collection", "Colección"],
      ["collector", "Coleccionista"],
      ["progress", "Progreso"],
      ["completed", "Completados"],
      ["unlocked", "Desbloqueados"],
      ["locked", "Bloqueados"],
      ["rare", "Logros raros"],
      ["legendary", "Logros legendarios"],
      ["rewardinfo", "Información de recompensas"],
      ["questinfo", "Información de misiones"],
      ["missioninfo", "Información de misiones"],
      ["prizeinfo", "Información de premios"],
      ["giftinfo", "Información de regalos"],
      ["trophyinfo", "Información de trofeos"],
      ["badgeinfo", "Información de insignias"],
      ["collectioninfo", "Información de colección"],
      ["rewardrank", "Ranking de recompensas"],
      ["rewardstats", "Estadísticas"],
      ["claimdaily", "Reclamar diario"],
      ["claimweekly", "Reclamar semanal"],
      ["claimmonthly", "Reclamar mensual"],
      ["rewardlist", "Lista de recompensas"],
      ["questlist", "Lista de misiones"],
      ["missionlist", "Lista de misiones"],
      ["rewardhelp", "Ayuda de recompensas"]
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
      ["joins", "Entradas"],
      ["leaves", "Salidas"],
      ["rolesstats", "Estadísticas de roles"],
      ["botstats", "Estadísticas del bot"],
      ["economystats", "Estadísticas económicas"],
      ["gamestats", "Estadísticas de juegos"],
      ["modstats", "Estadísticas de moderación"],
      ["userstats", "Estadísticas de usuario"],
      ["xp", "Ver XP"],
      ["level", "Ver nivel"],
      ["rank", "Ver rango"],
      ["repstats", "Estadísticas de reputación"],
      ["coinstats", "Estadísticas de monedas"],
      ["messageStats", "Estadísticas de mensajes"],
      ["joinstats", "Estadísticas de entradas"],
      ["leavestats", "Estadísticas de salidas"],
      ["servercount", "Cantidad de servidores"],
      ["memberstats2", "Datos de miembros"],
      ["channelstats", "Datos de canales"],
      ["rolestats", "Datos de roles"],
      ["emojistats", "Datos de emojis"],
      ["activitystats", "Datos de actividad"],
      ["commandstats", "Comandos usados"],
      ["profileStats", "Estadísticas de perfil"],
      ["personalstats", "Estadísticas personales"],
      ["weeklystats", "Estadísticas semanales"],
      ["monthlystats", "Estadísticas mensuales"],
      ["totalearned", "Dinero ganado"],
      ["totalmessages", "Mensajes totales"],
      ["totalxp", "XP total"],
      ["statistics", "Resumen estadístico"],
      ["statshelp", "Ayuda de estadísticas"]
    ]
  },

  customization: {
    name: "🎨 Personalización",
    color: COLORS.pink,
    commands: [
      ["color", "Color"],
      ["setcolor", "Configurar color"],
      ["theme", "Tema"],
      ["nickname", "Apodo"],
      ["setnickname", "Configurar apodo"],
      ["resetnickname", "Restablecer apodo"],
      ["servername", "Nombre del servidor"],
      ["setservername", "Cambiar nombre"],
      ["description", "Descripción"],
      ["setdescription", "Cambiar descripción"],
      ["welcome", "Estado de bienvenida"],
      ["setwelcome", "Configurar bienvenida"],
      ["goodbye", "Estado de despedida"],
      ["setgoodbye", "Configurar despedida"],
      ["autorole", "Rol automático"],
      ["setautorole", "Configurar autorol"],
      ["welcomechannel", "Canal de bienvenida"],
      ["goodbyechannel", "Canal de despedida"],
      ["log", "Canal de logs"],
      ["settings", "Configuración"],
      ["serverconfig", "Configuración del servidor"],
      ["profilecolor", "Color de perfil"],
      ["setprofilecolor", "Configurar color"],
      ["profiletheme", "Tema de perfil"],
      ["servericon", "Icono del servidor"],
      ["icon", "Icono"],
      ["serverbanner", "Banner"],
      ["banner", "Banner"],
      ["channelname", "Nombre de canal"],
      ["rolename", "Nombre de rol"],
      ["rolecolor", "Color de rol"],
      ["setrolecolor", "Cambiar color de rol"],
      ["roleicon", "Icono de rol"],
      ["setroleicon", "Configurar icono"],
      ["serverinfo", "Información de configuración"],
      ["customization", "Resumen"],
      ["customize", "Personalizar"],
      ["welcomemsg", "Mensaje de bienvenida"],
      ["goodbyemsg", "Mensaje de despedida"],
      ["autoroledisplay", "Mostrar autorol"],
      ["logchannel", "Canal de logs"],
      ["customsettings", "Configuración personalizada"],
      ["serverlook", "Vista del servidor"],
      ["customhelp", "Ayuda de personalización"],
      ["setprefixinfo", "Información de prefijo"],
      ["themeinfo", "Información del tema"],
      ["branding", "Marca del servidor"],
      ["brandinginfo", "Información de marca"],
      ["customhelp2", "Ayuda"]
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
      ["legendary", "Logros legendarios"],
      ["achievementlist", "Lista de logros"],
      ["achievementinfo", "Información"],
      ["achievementprogress", "Progreso"],
      ["achievementrank", "Ranking"],
      ["achievementstats", "Estadísticas"],
      ["badgestats", "Estadísticas de insignias"],
      ["titlelist", "Lista de títulos"],
      ["titleinfo", "Información de título"],
      ["collectionlist", "Lista de colección"],
      ["collectionstats", "Estadísticas"],
      ["masterylist", "Lista de maestrías"],
      ["masteryinfo", "Información"],
      ["rarelist", "Lista de raros"],
      ["legendarylist", "Lista legendaria"],
      ["unlockedlist", "Lista desbloqueada"],
      ["lockedlist", "Lista bloqueada"],
      ["completedlist", "Lista completada"],
      ["progresslist", "Lista de progreso"],
      ["milestonelist", "Lista de hitos"],
      ["trophies", "Trofeos"],
      ["trophylist", "Lista de trofeos"],
      ["badgecollection", "Colección de insignias"],
      ["titlecollection", "Colección de títulos"],
      ["achievementcollection", "Colección"],
      ["achievementhelp", "Ayuda"],
      ["achievementcheck", "Comprobar progreso"],
      ["achievementstatus", "Estado"],
      ["achievementsummary", "Resumen"],
      ["achievementmenu", "Menú de logros"]
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
      ["number", "Número secreto"],
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
      ["gamehelp", "Ayuda de juegos"],
      ["guessnumber", "Adivina número"],
      ["guessword", "Adivina palabra"],
      ["quickmath", "Matemática rápida"],
      ["quickreaction", "Reacción rápida"],
      ["truefalse", "Verdadero o falso"],
      ["higherlower", "Mayor o menor"],
      ["dicebattle", "Batalla de dados"],
      ["luckgame", "Juego de suerte"],
      ["numberbattle", "Batalla numérica"],
      ["wordshuffle", "Palabras mezcladas"],
      ["quizgame", "Juego de preguntas"],
      ["triviagame", "Juego de trivia"],
      ["memorygame", "Juego de memoria"],
      ["sequencegame", "Juego de secuencia"],
      ["riddlegame", "Juego de acertijos"],
      ["wordgame", "Juego de palabras"],
      ["anagramgame", "Juego de anagramas"],
      ["scramblegame", "Juego scramble"],
      ["mathgame", "Juego matemático"],
      ["reactiongame", "Juego de reacción"],
      ["challengegame", "Juego desafío"],
      ["randomchallenge", "Desafío aleatorio"],
      ["dailygame", "Juego diario"],
      ["game", "Juego aleatorio"],
      ["play", "Jugar"],
      ["games", "Lista de juegos"],
      ["minigames", "Minijuegos"],
      ["gamesinfo", "Información"],
      ["gameshelp", "Ayuda"]
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
      ["invite", "Invitación"],
      ["report", "Reportar"],
      ["suggest", "Sugerencia"],
      ["feedback", "Feedback"],
      ["bug", "Reportar bug"],
      ["bugs", "Bugs"],
      ["changelog", "Cambios"],
      ["updates", "Actualizaciones"],
      ["faq", "Preguntas frecuentes"],
      ["madokamiinfo", "Información"],
      ["bot", "Información del bot"],
      ["botversion", "Versión"],
      ["botstatus", "Estado"],
      ["botfeatures", "Funciones"],
      ["botcommands", "Comandos"],
      ["botprivacy", "Privacidad"],
      ["botsupport", "Soporte"],
      ["botinvite", "Invitación"],
      ["botsuggest", "Sugerencias"],
      ["botreport", "Reportes"],
      ["botbug", "Bugs"],
      ["botupdates", "Actualizaciones"],
      ["botfaq", "Preguntas"],
      ["developers", "Desarrolladores"],
      ["developer", "Desarrollador"],
      ["project", "Proyecto"],
      ["projectinfo", "Información del proyecto"],
      ["release", "Versión publicada"],
      ["releases", "Versiones"],
      ["news", "Noticias"],
      ["notice", "Avisos"],
      ["rules", "Reglas"],
      ["community", "Comunidad"],
      ["links", "Enlaces"],
      ["website", "Sitio web"],
      ["help", "Ayuda"],
      ["madokamihelp", "Ayuda de Madokami"],
      ["readme", "Información general"]
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
      ["prefixinfo", "Prefijo"],
      ["memberinfo", "Información de miembro"],
      ["channelcount", "Cantidad de canales"],
      ["rolecount", "Cantidad de roles"],
      ["emojicount", "Cantidad de emojis"],
      ["stickercount", "Cantidad de stickers"],
      ["servericon", "Icono"],
      ["serverbanner", "Banner"],
      ["serverowner", "Propietario"],
      ["servercreated", "Creación"],
      ["memberjoined", "Entrada"],
      ["account", "Cuenta"],
      ["accountinfo", "Información de cuenta"],
      ["id", "ID"],
      ["myid", "Mi ID"],
      ["serverid", "ID servidor"],
      ["botid", "ID del bot"],
      ["mention", "Mención"],
      ["roleslist", "Lista de roles"],
      ["channelslist", "Lista de canales"],
      ["emojiList", "Lista de emojis"],
      ["infoall", "Información completa"],
      ["overview", "Resumen"],
      ["details", "Detalles"],
      ["serverdetails", "Detalles del servidor"],
      ["memberdetails", "Detalles del miembro"],
      ["infostats", "Estadísticas"],
      ["information", "Información"],
      ["informationhelp", "Ayuda"]
    ]
  }
};

// ============================================================
// 👑 ADMINISTRACIÓN
// 4 CATEGORÍAS × 20 COMANDOS
// ============================================================

const ADMIN_CATEGORIES = {

  security: {
    name: "🔐 Seguridad",
    commands: [
      "antilink",
      "antispam",
      "whitelist",
      "security",
      "securityinfo",
      "protection",
      "protectioninfo",
      "filter",
      "linkfilter",
      "spamfilter",
      "securitylog",
      "securitystats",
      "securitycheck",
      "automod",
      "automodinfo",
      "lockdown",
      "unlockdown",
      "verify",
      "verification",
      "securityhelp"
    ]
  },

  config: {
    name: "⚙️ Configuración",
    commands: [
      "setup",
      "log",
      "welcome",
      "welcomechannel",
      "goodbye",
      "goodbyechannel",
      "autorole",
      "settings",
      "reloadconfig",
      "serverconfig",
      "config",
      "configinfo",
      "setwelcome",
      "setgoodbye",
      "setautorole",
      "setlog",
      "resetconfig",
      "resetwelcome",
      "resetgoodbye",
      "confighelp"
    ]
  },

  automation: {
    name: "🤖 Automatización",
    commands: [
      "say",
      "announce",
      "autoreplyadd",
      "autoreplydel",
      "autoreplylist",
      "autoreactadd",
      "autoreactdel",
      "autoreactlist",
      "reactionrole",
      "autoroleadd",
      "autoroleremove",
      "autorolelist",
      "autoresponse",
      "automessage",
      "schedule",
      "automation",
      "automationinfo",
      "automationlist",
      "automationreset",
      "automationhelp"
    ]
  },

  administration: {
    name: "👑 Administración",
    commands: [
      "clearlogs",
      "adminstats",
      "admininfo",
      "staff",
      "admins",
      "mods",
      "modroles",
      "serverlock",
      "serverunlock",
      "admincheck",
      "permissionscheck",
      "audit",
      "auditinfo",
      "moderationlog",
      "memberlog",
      "rolelog",
      "channellog",
      "adminhelp",
      "admincommands",
      "adminpanel"
    ]
  }
};

// ============================================================
// 📖 HELP
// ============================================================

function homeEmbed() {
  return embed(
    "Madokami • Centro de ayuda",
    [
      "✨ **Selecciona una categoría**",
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
      `📚 **${Object.values(CATEGORIES).length} categorías**`,
      "📄 Cada categoría tiene **50 comandos**.",
      "📑 Cada página muestra **25 comandos**.",
      "",
      "👑 Administración: `m!helpad`"
    ].join("\n")
  );
}

function helpMenu() {
  const options = Object.entries(CATEGORIES).map(
    ([key, category]) => ({
      label: category.name.substring(2),
      value: key,
      emoji: category.name.substring(0, 2).trim()
    })
  );

  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("madokami_category")
        .setPlaceholder("🌸 Selecciona una categoría")
        .addOptions(options)
    )
  ];
}

function categoryEmbed(key, page = 1) {
  const category = CATEGORIES[key];

  if (!category) return homeEmbed();

  const start = (page - 1) * 25;

  const commands =
    category.commands.slice(start, start + 25);

  return embed(
    `${category.name} • Página ${page}/2`,
    commands.map(
      ([command, description], i) =>
        `**${start + i + 1}. \`${PREFIX}${command}\`** — ${description}`
    ).join("\n"),
    category.color
  );
}

function categoryButtons(key, page) {
  return new ActionRowBuilder().addComponents(

    new ButtonBuilder()
      .setCustomId(
        `madokami_prev:${key}:${page}`
      )
      .setLabel("◀️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 1),

    new ButtonBuilder()
      .setCustomId(
        `madokami_home:${key}:1`
      )
      .setLabel("🌸 Inicio")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId(
        `madokami_next:${key}:${page}`
      )
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

// ============================================================
// 👑 HELP ADMIN
// ============================================================

function adminMenu() {
  return [
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("madokami_admin_category")
        .setPlaceholder("👑 Selecciona administración")
        .addOptions(
          Object.entries(ADMIN_CATEGORIES)
            .map(([key, category]) => ({
              label: category.name.substring(2),
              value: key,
              emoji: category.name.substring(0, 2).trim()
            }))
        )
    )
  ];
}

function adminCategoryEmbed(key) {
  const category = ADMIN_CATEGORIES[key];

  if (!category) {
    return embed(
      "👑 Administración",
      "Selecciona una categoría."
    );
  }

  return embed(
    `${category.name} • Página 1`,
    category.commands
      .map(
        (command, index) =>
          `**${index + 1}. \`${PREFIX}${command}\`**`
      )
      .join("\n"),
    COLORS.purple
  );
}

async function showAdminHelp(message) {
  if (!isAdmin(message)) {
    return reply(
      message,
      "🔒 Acceso denegado",
      "Solo administradores pueden usar `m!helpad`.",
      COLORS.red
    );
  }

  return message.reply({
    embeds: [
      embed(
        "👑 Madokami • Administración",
        [
          "Selecciona una categoría.",
          "",
          "🔐 Seguridad",
          "⚙️ Configuración",
          "🤖 Automatización",
          "👑 Administración",
          "",
          "Cada categoría contiene **20 comandos**."
        ].join("\n"),
        COLORS.purple
      )
    ],
    components: adminMenu()
  });
}

// ============================================================
// 💰 ECONOMÍA
// ============================================================

async function economyCommand(
  message,
  command,
  args,
  user
) {

  if (
    [
      "balance",
      "wallet",
      "cash",
      "coin",
      "pocket"
    ].includes(command)
  ) {
    return reply(
      message,
      "💰 Balance",
      `💵 Efectivo: **${user.balance}**\n🏦 Banco: **${user.bank}**`,
      COLORS.gold
    );
  }

  if (command === "bank") {
    return reply(
      message,
      "🏦 Banco",
      `Dinero en banco: **${user.bank}**`,
      COLORS.gold
    );
  }

  if (command === "work" || command === "job") {

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
      Math.floor(Math.random() * 201) + 100;

    money(user, amount);

    return reply(
      message,
      "💼 Trabajo completado",
      `Ganaste **${amount} monedas**.\n💰 Nuevo saldo: **${user.balance}**`,
      COLORS.green
    );
  }

  if (command === "daily") {

    const left =
      cooldown(user, "daily", 86400000);

    if (left) {
      return reply(
        message,
        "⏳ Daily",
        `Ya reclamaste tu recompensa diaria.`
      );
    }

    money(user, 500);

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
        "⏳ Weekly",
        "Ya reclamaste tu recompensa semanal."
      );
    }

    money(user, 2500);

    return reply(
      message,
      "🎁 Recompensa semanal",
      "Recibiste **2500 monedas**.",
      COLORS.gold
    );
  }

  if (command === "monthly") {

    const left =
      cooldown(user, "monthly", 2592000000);

    if (left) {
      return reply(
        message,
        "⏳ Monthly",
        "Ya reclamaste tu recompensa mensual."
      );
    }

    money(user, 10000);

    return reply(
      message,
      "🎁 Recompensa mensual",
      "Recibiste **10000 monedas**.",
      COLORS.gold
    );
  }

  if (command === "bonus") {

    const left =
      cooldown(user, "bonus", 3600000);

    if (left) {
      return reply(
        message,
        "⏳ Bono",
        "Ya reclamaste el bono de esta hora."
      );
    }

    money(user, 250);

    return reply(
      message,
      "🎁 Bono",
      "Recibiste **250 monedas**.",
      COLORS.green
    );
  }

  if (command === "deposit") {

    const amount = Number(args[0]);

    if (!Number.isFinite(amount) || amount <= 0) {
      return reply(
        message,
        "🏦 Depósito",
        `Uso: \`${PREFIX}deposit cantidad\``,
        COLORS.red
      );
    }

    if (amount > user.balance) {
      return reply(
        message,
        "🏦 Depósito",
        "No tienes suficiente efectivo.",
        COLORS.red
      );
    }

    user.balance -= amount;
    user.bank += amount;
    save();

    return reply(
      message,
      "🏦 Depósito realizado",
      `Depositaste **${amount} monedas**.`,
      COLORS.green
    );
  }

  if (command === "withdraw") {

    const amount = Number(args[0]);

    if (!Number.isFinite(amount) || amount <= 0) {
      return reply(
        message,
        "🏦 Retiro",
        `Uso: \`${PREFIX}withdraw cantidad\``,
        COLORS.red
      );
    }

    if (amount > user.bank) {
      return reply(
        message,
        "🏦 Retiro",
        "No tienes suficiente dinero en el banco.",
        COLORS.red
      );
    }

    user.bank -= amount;
    user.balance += amount;
    save();

    return reply(
      message,
      "🏦 Retiro realizado",
      `Retiraste **${amount} monedas**.`,
      COLORS.green
    );
  }

  if (
    command === "pay" ||
    command === "give" ||
    command === "tip" ||
    command === "transfer"
  ) {

    const target =
      targetMember(message, args[0]);

    const amount =
      Number(args[1]);

    if (
      !target ||
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return reply(
        message,
        "💸 Pago",
        `Uso: \`${PREFIX}${command} @usuario cantidad\``,
        COLORS.red
      );
    }

    if (target.id === message.author.id) {
      return reply(
        message,
        "💸 Pago",
        "No puedes pagarte a ti mismo.",
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
      userData(message.guild.id, target.id);

    user.balance -= amount;
    receiver.balance += amount;

    save();

    return reply(
      message,
      "💸 Pago realizado",
      `Enviaste **${amount} monedas** a ${target}.`,
      COLORS.green
    );
  }

  if (command === "crime") {

    const left =
      cooldown(user, "crime", 120000);

    if (left) {
      return reply(
        message,
        "⏳ Crime",
        `Espera **${left} segundos**.`
      );
    }

    if (user.balance < 600) {
      return reply(
        message,
        "💰 Crime",
        "Necesitas al menos **600 monedas** para correr el riesgo.",
        COLORS.red
      );
    }

    if (Math.random() < 0.20) {

      const amount =
        Math.floor(Math.random() * 201) + 500;

      money(user, amount);

      return reply(
        message,
        "🍀 Crime",
        `¡Ganaste **${amount} monedas**!`,
        COLORS.green
      );
    }

    user.balance -= 600;
    save();

    return reply(
      message,
      "💥 Crime",
      "Perdiste **600 monedas**.",
      COLORS.red
    );
  }

  if (command === "risk") {

    const left =
      cooldown(user, "risk", 60000);

    if (left) {
      return reply(
        message,
        "⏳ Risk",
        `Espera **${left} segundos**.`
      );
    }

    if (user.balance < 500) {
      return reply(
        message,
        "💰 Risk",
        "Necesitas al menos **500 monedas** para usar `m!risk`.",
        COLORS.red
      );
    }

    if (Math.random() < 0.30) {

      const amount =
        Math.floor(Math.random() * 251) + 300;

      money(user, amount);

      return reply(
        message,
        "🍀 Risk",
        `¡Ganaste **${amount} monedas**!`,
        COLORS.green
      );
    }

    const loss =
      Math.floor(Math.random() * 201) + 300;

    user.balance -= loss;

    save();

    return reply(
      message,
      "💥 Risk",
      `Perdiste **${loss} monedas**.`,
      COLORS.red
    );
  }

  if (
    ["beg", "fish", "hunt", "dig", "forage", "salary"]
      .includes(command)
  ) {

    const left =
      cooldown(user, command, 30000);

    if (left) {
      return reply(
        message,
        "⏳ Espera",
        `Espera **${left} segundos**.`
      );
    }

    const amount =
      Math.floor(Math.random() * 151) + 50;

    money(user, amount);

    return reply(
      message,
      "💰 Ganancia",
      `Ganaste **${amount} monedas** usando \`${PREFIX}${command}\`.`,
      COLORS.green
    );
  }

  if (
    command === "rich" ||
    command === "networth"
  ) {

    return reply(
      message,
      "💎 Patrimonio",
      `💵 Efectivo: **${user.balance}**\n🏦 Banco: **${user.bank}**\n💎 Total: **${user.balance + user.bank}**`,
      COLORS.gold
    );
  }

  if (
    command === "depositall"
  ) {

    if (user.balance <= 0) {
      return reply(
        message,
        "🏦 Banco",
        "No tienes efectivo."
      );
    }

    const amount = user.balance;

    user.balance = 0;
    user.bank += amount;

    save();

    return reply(
      message,
      "🏦 Banco",
      `Depositaste todo: **${amount} monedas**.`,
      COLORS.green
    );
  }

  if (
    command === "withdrawall"
  ) {

    if (user.bank <= 0) {
      return reply(
        message,
        "🏦 Banco",
        "No tienes dinero en el banco."
      );
    }

    const amount = user.bank;

    user.bank = 0;
    user.balance += amount;

    save();

    return reply(
      message,
      "🏦 Banco",
      `Retiraste todo: **${amount} monedas**.`,
      COLORS.green
    );
  }

  if (
    command === "leaderboard" ||
    command === "topcoins" ||
    command === "moneyrank"
  ) {

    const entries =
      Object.entries(
        db.users[message.guild.id] || {}
      )
      .map(([id, data]) => ({
        id,
        total:
          (data.balance || 0) +
          (data.bank || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    if (!entries.length) {
      return reply(
        message,
        "🏆 Ranking",
        "Todavía no hay datos."
      );
    }

    return reply(
      message,
      "🏆 Ranking económico",
      entries
        .map(
          (x, i) =>
            `**${i + 1}.** <@${x.id}> — **${x.total} monedas**`
        )
        .join("\n"),
      COLORS.gold
    );
  }

  if (
    command === "shop" ||
    command === "economy" ||
    command === "earn" ||
    command === "financial"
  ) {

    return reply(
      message,
      "💰 Economía",
      [
        "`m!work` — 100–300 cada 30s",
        "`m!daily` — 500 cada 24h",
        "`m!weekly` — 2500 cada semana",
        "`m!monthly` — 10000 cada mes",
        "`m!bonus` — 250 cada hora",
        "`m!risk` — riesgo económico",
        "`m!crime` — riesgo económico",
        "`m!fish` — ganar monedas",
        "`m!beg` — ganar monedas"
      ].join("\n"),
      COLORS.gold
    );
  }

  if (
    [
      "buy",
      "sell",
      "inventory",
      "item"
    ].includes(command)
  ) {

    if (command === "inventory") {
      return reply(
        message,
        "🎒 Inventario",
        user.inventory.length
          ? user.inventory.join("\n")
          : "Tu inventario está vacío."
      );
    }

    if (command === "item") {
      return reply(
        message,
        "📦 Objeto",
        args[0]
          ? `Buscando información sobre **${args[0]}**.`
          : "Escribe el nombre del objeto."
      );
    }

    if (command === "buy") {
      return reply(
        message,
        "🛒 Tienda",
        "Tienda básica disponible. Usa `m!shop` para ver la economía."
      );
    }

    return reply(
      message,
      "💰 Venta",
      "No tienes objetos vendibles actualmente."
    );
  }

  return null;
}

// ============================================================
// 🎮 JUEGOS
// ============================================================

async function gameCommand(
  message,
  command,
  args,
  raw
) {

  if (command === "coinflip") {
    return reply(
      message,
      "🪙 Cara o cruz",
      Math.random() < 0.5
        ? "🪙 **Cara**"
        : "🪙 **Cruz**"
    );
  }

  if (
    ["dice", "roll", "dicegame"].includes(command)
  ) {

    const max =
      Math.max(
        2,
        Math.min(
          Number(args[0]) || 6,
          100
        )
      );

    return reply(
      message,
      "🎲 Dados",
      `Resultado: **${Math.floor(Math.random() * max) + 1}**`
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
      "🔮 Bola 8",
      answers[
        Math.floor(
          Math.random() * answers.length
        )
      ]
    );
  }

  if (command === "rps") {

    const choices = [
      "piedra",
      "papel",
      "tijera"
    ];

    const userChoice =
      (args[0] || "").toLowerCase();

    if (!choices.includes(userChoice)) {
      return reply(
        message,
        "✊ Piedra, papel o tijera",
        `Uso: \`${PREFIX}rps piedra\`, \`${PREFIX}rps papel\` o \`${PREFIX}rps tijera\``
      );
    }

    const bot =
      choices[
        Math.floor(
          Math.random() * choices.length
        )
      ];

    let result;

    if (userChoice === bot) {
      result = "🤝 Empate.";
    } else if (
      (userChoice === "piedra" && bot === "tijera") ||
      (userChoice === "papel" && bot === "piedra") ||
      (userChoice === "tijera" && bot === "papel")
    ) {
      result = "🎉 ¡Ganaste!";
    } else {
      result = "😅 Gané yo.";
    }

    return reply(
      message,
      "✊ Piedra, papel o tijera",
      `Tú: **${userChoice}**\nMadokami: **${bot}**\n\n${result}`
    );
  }

  if (
    [
      "joke",
      "fact",
      "funfact",
      "randomfact",
      "quote",
      "fortune"
    ].includes(command)
  ) {

    const data = {

      joke: [
        "¿Qué hace un pez? Nada.",
        "¿Qué hace una abeja en el gimnasio? Zum-ba.",
        "¿Qué le dijo un techo a otro? Techo de menos."
      ],

      fact: [
        "Los pulpos tienen tres corazones.",
        "La miel puede conservarse durante muchísimo tiempo.",
        "Los plátanos son técnicamente bayas."
      ],

      quote: [
        "Cada día es una nueva oportunidad.",
        "Los pequeños pasos también cuentan.",
        "La constancia hace la diferencia."
      ],

      fortune: [
        "Hoy puede aparecer una buena oportunidad.",
        "Algo inesperado podría alegrarte el día.",
        "Tu suerte está en movimiento."
      ]
    };

    const list =
      data[command] ||
      data.fact;

    return reply(
      message,
      "🎮 Diversión",
      list[
        Math.floor(
          Math.random() * list.length
        )
      ]
    );
  }

  if (command === "guess") {

    const number =
      Math.floor(Math.random() * 10) + 1;

    return reply(
      message,
      "🎯 Adivina",
      `Pensé en un número del **1 al 10**.\nTu comando debe ser algo como \`${PREFIX}guess 7\`.\n\nNúmero de esta ronda: **${number}**`
    );
  }

  if (
    command === "number" ||
    command === "guessnumber"
  ) {

    const number =
      Math.floor(Math.random() * 100) + 1;

    return reply(
      message,
      "🔢 Número secreto",
      `El número de esta ronda es **${number}**.\nIntenta adivinarlo en tu siguiente mensaje.`
    );
  }

  if (
    command === "reversewords"
  ) {

    if (!raw) {
      return reply(
        message,
        "🔄 Invertir palabras",
        `Uso: \`${PREFIX}reversewords hola mundo\``
      );
    }

    return reply(
      message,
      "🔄 Resultado",
      raw
        .split(/\s+/)
        .reverse()
        .join(" ")
    );
  }

  if (command === "shuffle") {

    if (!raw) {
      return reply(
        message,
        "🔀 Shuffle",
        `Uso: \`${PREFIX}shuffle texto\``
      );
    }

    const chars =
      raw.split("");

    for (
      let i = chars.length - 1;
      i > 0;
      i--
    ) {
      const j =
        Math.floor(
          Math.random() * (i + 1)
        );

      [chars[i], chars[j]] =
        [chars[j], chars[i]];
    }

    return reply(
      message,
      "🔀 Texto mezclado",
      chars.join("")
    );
  }

  if (
    command === "reverse" ||
    command === "reversewords"
  ) {
    return reply(
      message,
      "🔄 Resultado",
      raw.split("").reverse().join("")
    );
  }

  if (
    command === "uppercase"
  ) {
    return reply(
      message,
      "🔠 Mayúsculas",
      raw
        ? raw.toUpperCase()
        : "Escribe un texto."
    );
  }

  if (
    command === "lowercase"
  ) {
    return reply(
      message,
      "🔡 Minúsculas",
      raw
        ? raw.toLowerCase()
        : "Escribe un texto."
    );
  }

  if (command === "ascii") {

    if (!raw) {
      return reply(
        message,
        "🔤 ASCII",
        "Escribe un texto."
      );
    }

    return reply(
      message,
      "🔤 ASCII",
      `\`\`\`\n${clean(raw, 1800)}\n\`\`\``
    );
  }

  if (
    [
      "trivia",
      "quiz",
      "math",
      "riddle",
      "word",
      "scramble",
      "anagram",
      "memory",
      "sequence",
      "reaction",
      "challenge",
      "truefalse",
      "quickmath",
      "quickreaction"
    ].includes(command)
  ) {

    const questions = [
      {
        q: "¿Cuánto es 5 + 7?",
        a: "12"
      },
      {
        q: "¿Cuál es el planeta más grande del sistema solar?",
        a: "jupiter"
      },
      {
        q: "¿Cuántos lados tiene un triángulo?",
        a: "3"
      },
      {
        q: "¿Cuál es la capital de Francia?",
        a: "paris"
      }
    ];

    const question =
      questions[
        Math.floor(
          Math.random() * questions.length
        )
      ];

    return reply(
      message,
      "🎯 Minijuego",
      `**Pregunta:** ${question.q}\n\n💡 Respuesta de esta ronda: ||${question.a}||`
    );
  }

  if (command === "wyr") {

    const options = [
      "¿Volar o ser invisible?",
      "¿Viajar al futuro o al pasado?",
      "¿Tener muchísimo dinero o muchísimo conocimiento?"
    ];

    return reply(
      message,
      "🤔 ¿Qué prefieres?",
      options[
        Math.floor(
          Math.random() * options.length
        )
      ]
    );
  }

  if (command === "riddle") {

    return reply(
      message,
      "🧩 Acertijo",
      "Tengo agujas pero no sé coser. ¿Qué soy?\n\n||Un reloj.||"
    );
  }

  return null;
}

// ============================================================
// 👥 SOCIAL
// ============================================================

async function socialCommand(
  message,
  command,
  args,
  user
) {

  if (
    [
      "profile",
      "userinfo",
      "userinfo2",
      "user"
    ].includes(command)
  ) {

    const target =
      targetMember(message, args[0]) ||
      message.member;

    const data =
      userData(
        message.guild.id,
        target.id
      );

    return reply(
      message,
      "👤 Perfil",
      [
        `👤 Usuario: ${target}`,
        `🆔 ID: \`${target.id}\``,
        `⭐ Nivel: **${data.level}**`,
        `✨ XP: **${data.xp}**`,
        `👍 Reputación: **${data.rep}**`,
        `💰 Dinero: **${data.balance}**`,
        `⚠️ Advertencias: **${data.warnings.length}**`
      ].join("\n")
    );
  }

  if (command === "rep") {

    const target =
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "👍 Reputación",
        `Uso: \`${PREFIX}rep @usuario\``,
        COLORS.red
      );
    }

    if (target.id === message.author.id) {
      return reply(
        message,
        "👍 Reputación",
        "No puedes darte reputación a ti mismo.",
        COLORS.red
      );
    }

    const left =
      cooldown(user, "rep", 43200000);

    if (left) {
      return reply(
        message,
        "⏳ Reputación",
        "Ya diste reputación recientemente."
      );
    }

    const targetData =
      userData(
        message.guild.id,
        target.id
      );

    targetData.rep++;

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
      targetMember(message, args[0]) ||
      message.member;

    const data =
      userData(
        message.guild.id,
        target.id
      );

    return reply(
      message,
      "📖 Biografía",
      data.bio || "Sin biografía."
    );
  }

  if (
    command === "setbio" ||
    command === "setabout"
  ) {

    if (!args.length) {
      return reply(
        message,
        "📖 Biografía",
        `Uso: \`${PREFIX}${command} texto\``,
        COLORS.red
      );
    }

    user.bio = rawLimit(
      args.join(" "),
      300
    );

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
    command === "rank" ||
    command === "levelinfo" ||
    command === "xpinfo"
  ) {

    return reply(
      message,
      "⭐ Nivel",
      `Nivel: **${user.level}**\nXP: **${user.xp}/${user.level * 100}**`
    );
  }

  if (command === "top") {

    const entries =
      Object.entries(
        db.users[message.guild.id] || {}
      )
      .map(([id, data]) => ({
        id,
        xp: data.xp || 0,
        level: data.level || 1
      }))
      .sort(
        (a, b) =>
          b.level - a.level ||
          b.xp - a.xp
      )
      .slice(0, 10);

    return reply(
      message,
      "🏆 Ranking XP",
      entries.length
        ? entries
          .map(
            (x, i) =>
              `**${i + 1}.** <@${x.id}> — Nivel **${x.level}** (${x.xp} XP)`
          )
          .join("\n")
        : "No hay datos."
    );
  }

  if (
    command === "afk" ||
    command === "setafk"
  ) {

    user.afk = true;
    user.afkText =
      args.join(" ") ||
      "Estoy AFK.";

    save();

    return reply(
      message,
      "💤 AFK",
      `AFK activado.\nMensaje: **${user.afkText}**`
    );
  }

  if (
    command === "clearaFk" ||
    command === "afkinfo"
  ) {

    if (command === "clearaFk") {
      user.afk = false;
      user.afkText = "";
      save();

      return reply(
        message,
        "💤 AFK",
        "AFK desactivado.",
        COLORS.green
      );
    }

    return reply(
      message,
      "💤 AFK",
      user.afk
        ? `AFK: **Sí**\nMensaje: ${user.afkText}`
        : "AFK: **No**"
    );
  }

  if (
    command === "setbirthday"
  ) {

    if (!args[0]) {
      return reply(
        message,
        "🎂 Cumpleaños",
        `Uso: \`${PREFIX}setbirthday DD/MM\``
      );
    }

    user.birthday =
      args[0].slice(0, 20);

    save();

    return reply(
      message,
      "🎂 Cumpleaños",
      `Cumpleaños guardado como **${user.birthday}**.`,
      COLORS.green
    );
  }

  if (
    command === "birthday" ||
    command === "birthdayinfo"
  ) {

    return reply(
      message,
      "🎂 Cumpleaños",
      user.birthday
        ? `Tu cumpleaños: **${user.birthday}**`
        : "No tienes cumpleaños configurado."
    );
  }

  if (command === "note" || command === "addnote") {

    if (!args.length) {
      return reply(
        message,
        "📝 Nota",
        `Uso: \`${PREFIX}note texto\``
      );
    }

    user.notes.push(
      args.join(" ").slice(0, 300)
    );

    user.notes =
      user.notes.slice(-20);

    save();

    return reply(
      message,
      "📝 Nota",
      "Nota guardada.",
      COLORS.green
    );
  }

  if (
    command === "notes" ||
    command === "notelist"
  ) {

    return reply(
      message,
      "📝 Notas",
      user.notes.length
        ? user.notes
          .map(
            (note, i) =>
              `**${i + 1}.** ${note}`
          )
          .join("\n")
        : "No tienes notas."
    );
  }

  if (command === "clearnotes") {

    user.notes = [];

    save();

    return reply(
      message,
      "📝 Notas",
      "Tus notas fueron eliminadas.",
      COLORS.green
    );
  }

  if (
    command === "myroles" ||
    command === "roles"
  ) {

    return reply(
      message,
      "🎭 Tus roles",
      message.member.roles.cache
        .filter(role => role.id !== message.guild.id)
        .map(role => `• ${role}`)
        .join("\n") ||
        "No tienes roles."
    );
  }

  if (
    command === "reputation" ||
    command === "repstats" ||
    command === "socialrank" ||
    command === "repleaderboard"
  ) {

    const entries =
      Object.entries(
        db.users[message.guild.id] || {}
      )
      .map(([id, data]) => ({
        id,
        rep: data.rep || 0
      }))
      .sort((a, b) => b.rep - a.rep)
      .slice(0, 10);

    return reply(
      message,
      "👍 Ranking de reputación",
      entries.length
        ? entries
          .map(
            (x, i) =>
              `**${i + 1}.** <@${x.id}> — **${x.rep} rep**`
          )
          .join("\n")
        : "No hay datos."
    );
  }

  return null;
}

function rawLimit(text, max) {
  return String(text || "").slice(0, max);
}

// ============================================================
// 🛡️ MODERACIÓN
// ============================================================

async function moderationCommand(
  message,
  command,
  args
) {

  if (!isModerator(message)) {
    return reply(
      message,
      "🔒 Sin permisos",
      "Necesitas permisos de moderación.",
      COLORS.red
    );
  }

  if (
    command === "ban" ||
    command === "kick"
  ) {

    const target =
      targetMember(message, args[0]);

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

    if (
      target.id === message.author.id
    ) {
      return reply(
        message,
        "🛡️ Moderación",
        "No puedes aplicar esta acción sobre ti mismo.",
        COLORS.red
      );
    }

    if (
      target.roles.highest.position >=
      message.member.roles.highest.position &&
      !isAdmin(message)
    ) {
      return reply(
        message,
        "🛡️ Moderación",
        "Ese usuario tiene un rol igual o superior al tuyo.",
        COLORS.red
      );
    }

    if (command === "ban") {

      const ok =
        await target.ban({
          reason
        })
        .then(() => true)
        .catch(() => false);

      if (!ok) {
        return reply(
          message,
          "🔨 Ban",
          "Discord rechazó el ban.",
          COLORS.red
        );
      }

      await sendLog(
        message.guild,
        "🔨 Usuario baneado",
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
        .then(() => true)
        .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "👢 Kick",
        "Discord rechazó la expulsión.",
        COLORS.red
      );
    }

    await sendLog(
      message.guild,
      "👢 Usuario expulsado",
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
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "🔇 Timeout",
        `Uso: \`${PREFIX}${command} @usuario razón\``,
        COLORS.red
      );
    }

    const reason =
      args.slice(1).join(" ") ||
      "Madokami";

    const ok =
      await target.timeout(
        2 * 60 * 60 * 1000,
        reason
      )
      .then(() => true)
      .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🔇 Timeout",
        "Discord rechazó el timeout.",
        COLORS.red
      );
    }

    await sendLog(
      message.guild,
      "🔇 Usuario silenciado",
      `${target.user.tag}\nDuración: 2 horas\nPor: ${message.author.tag}\nRazón: ${reason}`,
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
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "🔊 Unmute",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const ok =
      await target.timeout(null)
        .then(() => true)
        .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🔊 Unmute",
        "Discord rechazó la acción.",
        COLORS.red
      );
    }

    return reply(
      message,
      "🔊 Unmute",
      `${target.user.tag} ya no tiene timeout.`,
      COLORS.green
    );
  }

  if (command === "warn") {

    const target =
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "⚠️ Warn",
        `Uso: \`${PREFIX}warn @usuario razón\``,
        COLORS.red
      );
    }

    const data =
      userData(
        message.guild.id,
        target.id
      );

    const reason =
      args.slice(1).join(" ") ||
      "Sin razón";

    data.warnings.push({
      reason,
      moderator: message.author.id,
      date: Date.now()
    });

    save();

    await sendLog(
      message.guild,
      "⚠️ Advertencia",
      `${target.user.tag} recibió una advertencia.\nModerador: ${message.author.tag}\nRazón: ${reason}`,
      COLORS.gold
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
      targetMember(message, args[0]) ||
      message.member;

    const data =
      userData(
        message.guild.id,
        target.id
      );

    return reply(
      message,
      "⚠️ Advertencias",
      data.warnings.length
        ? data.warnings
          .map(
            (w, i) =>
              `**${i + 1}.** ${w.reason}`
          )
          .join("\n")
        : `${target.user.tag} no tiene advertencias.`
    );
  }

  if (command === "unwarn") {

    const target =
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "⚠️ Unwarn",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const data =
      userData(
        message.guild.id,
        target.id
      );

    if (!data.warnings.length) {
      return reply(
        message,
        "⚠️ Unwarn",
        "Ese usuario no tiene advertencias."
      );
    }

    data.warnings.pop();

    save();

    return reply(
      message,
      "⚠️ Unwarn",
      "Se eliminó la última advertencia.",
      COLORS.green
    );
  }

  if (
    command === "clear" ||
    command === "purge"
  ) {

    const amount =
      Math.min(
        Math.max(
          Number(args[0]) || 10,
          1
        ),
        100
      );

    const deleted =
      await message.channel
        .bulkDelete(amount, true)
        .catch(() => null);

    if (!deleted) {
      return reply(
        message,
        "🧹 Clear",
        "No pude eliminar los mensajes.",
        COLORS.red
      );
    }

    await sendLog(
      message.guild,
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
      Math.min(
        Math.max(
          Number(args[0]) || 0,
          0
        ),
        21600
      );

    const ok =
      await message.channel
        .setRateLimitPerUser(seconds)
        .then(() => true)
        .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🐢 Slowmode",
        "No pude modificar el slowmode.",
        COLORS.red
      );
    }

    return reply(
      message,
      "🐢 Slowmode",
      `Slowmode configurado en **${seconds} segundos**.`,
      COLORS.green
    );
  }

  if (
    command === "lock" ||
    command === "unlock"
  ) {

    const locked =
      command === "lock";

    const ok =
      await message.channel.permissionOverwrites
        .edit(
          message.guild.roles.everyone,
          {
            SendMessages: !locked
          }
        )
        .then(() => true)
        .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🔒 Canal",
        "No pude modificar los permisos.",
        COLORS.red
      );
    }

    await sendLog(
      message.guild,
      locked
        ? "🔒 Canal bloqueado"
        : "🔓 Canal desbloqueado",
      `${message.author.tag} modificó el canal ${message.channel}.`
    );

    return reply(
      message,
      locked
        ? "🔒 Canal bloqueado"
        : "🔓 Canal desbloqueado",
      locked
        ? "Nadie podrá enviar mensajes en este canal."
        : "Los usuarios podrán volver a enviar mensajes.",
      COLORS.green
    );
  }

  if (
    command === "nick" ||
    command === "resetnick"
  ) {

    const target =
      targetMember(message, args[0]);

    if (!target) {
      return reply(
        message,
        "🏷️ Nick",
        "Menciona al usuario.",
        COLORS.red
      );
    }

    const nick =
      command === "resetnick"
        ? null
        : args.slice(1).join(" ");

    const ok =
      await target
        .setNickname(nick || null)
        .then(() => true)
        .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🏷️ Nick",
        "No pude cambiar el apodo.",
        COLORS.red
      );
    }

    return reply(
      message,
      "🏷️ Nick",
      nick
        ? `Apodo cambiado a **${nick}**.`
        : "Apodo restablecido.",
      COLORS.green
    );
  }

  if (
    command === "roleadd" ||
    command === "roleremove"
  ) {

    const target =
      targetMember(message, args[0]);

    const role =
      targetRole(
        message.guild,
        args[1]
      );

    if (!target || !role) {
      return reply(
        message,
        "🎭 Roles",
        `Uso: \`${PREFIX}${command} @usuario @rol\``,
        COLORS.red
      );
    }

    const ok =
      await (
        command === "roleadd"
          ? target.roles.add(role)
          : target.roles.remove(role)
      )
      .then(() => true)
      .catch(() => false);

    if (!ok) {
      return reply(
        message,
        "🎭 Roles",
        "No pude modificar el rol.",
        COLORS.red
      );
    }

    return reply(
      message,
      "🎭 Roles",
      command === "roleadd"
        ? `Se añadió ${role} a ${target}.`
        : `Se quitó ${role} de ${target}.`,
      COLORS.green
    );
  }

  if (
    command === "roleinfo"
  ) {

    const role =
      targetRole(
        message.guild,
        args[0]
      );

    if (!role) {
      return reply(
        message,
        "🎭 Rol",
        `Uso: \`${PREFIX}roleinfo @rol\``
      );
    }

    return reply(
      message,
      "🎭 Información de rol",
      `Nombre: **${role.name}**\nID: \`${role.id}\`\nPosición: **${role.position}**\nMiembros: **${role.members.size}**`
    );
  }

  return null;
}

// ============================================================
// 👑 ADMIN COMMANDS
// ============================================================

async function adminCommand(
  message,
  command,
  args,
  raw
) {

  if (!isAdmin(message)) {
    return reply(
      message,
      "🔒 Acceso denegado",
      "Solo administradores pueden utilizar este comando.",
      COLORS.red
    );
  }

  const config =
    guildData(message.guild.id);

  if (command === "antilink") {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on", "off"].includes(value)) {
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

  if (command === "antispam") {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on", "off"].includes(value)) {
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
      targetMember(message, args[0]);

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
      `${target} fue actualizado en la lista blanca.`,
      COLORS.green
    );
  }

  if (
    command === "log" ||
    command === "setlog" ||
    command === "logchannel"
  ) {

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

    config.logChannel =
      channel.id;

    save();

    return reply(
      message,
      "📋 Logs",
      `Canal de logs: ${channel}`,
      COLORS.green
    );
  }

  if (
    command === "welcomechannel"
  ) {

    const channel =
      message.mentions.channels.first();

    if (!channel) {
      return reply(
        message,
        "🌸 Bienvenida",
        `Uso: \`${PREFIX}welcomechannel #canal\``,
        COLORS.red
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

  if (
    command === "welcome"
  ) {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on", "off"].includes(value)) {
      return reply(
        message,
        "🌸 Bienvenida",
        [
          `Uso: \`${PREFIX}welcome on\``,
          `Uso: \`${PREFIX}welcome off\``,
          "",
          "Después configura el canal:",
          `\`${PREFIX}welcomechannel #canal\``
        ].join("\n")
      );
    }

    config.welcome.enabled =
      value === "on";

    save();

    return reply(
      message,
      "🌸 Bienvenida",
      `Bienvenida: **${config.welcome.enabled ? "ACTIVADA" : "DESACTIVADA"}**`,
      COLORS.green
    );
  }

  if (command === "setwelcome") {

    if (!raw) {
      return reply(
        message,
        "🌸 Bienvenida",
        `Uso: \`${PREFIX}setwelcome mensaje\`\n\nVariables: `{user}`, `{server}`, `{count}``
      );
    }

    config.welcome.message =
      raw.slice(0, 1000);

    save();

    return reply(
      message,
      "🌸 Bienvenida",
      "Mensaje de bienvenida actualizado.",
      COLORS.green
    );
  }

  if (
    command === "goodbye"
  ) {

    const value =
      (args[0] || "").toLowerCase();

    if (!["on", "off"].includes(value)) {
      return reply(
        message,
        "👋 Despedida",
        `Uso: \`${PREFIX}goodbye on\` o \`${PREFIX}goodbye off\``
      );
    }

    config.goodbye.enabled =
      value === "on";

    save();

    return reply(
      message,
      "👋 Despedida",
      `Despedida: **${config.goodbye.enabled ? "ACTIVADA" : "DESACTIVADA"}**`,
      COLORS.green
    );
  }

  if (
    command === "goodbyechannel"
  ) {

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

  if (command === "setgoodbye") {

    if (!raw) {
      return reply(
        message,
        "👋 Despedida",
        `Uso: \`${PREFIX}setgoodbye mensaje\``
      );
    }

    config.goodbye.message =
      raw.slice(0, 1000);

    save();

    return reply(
      message,
      "👋 Despedida",
      "Mensaje de despedida actualizado.",
      COLORS.green
    );
  }

  if (
    command === "autorole" ||
    command === "setautorole" ||
    command === "autoroleadd"
  ) {

    const role =
      targetRole(
        message.guild,
        args[0]
      );

    if (!role) {
      return reply(
        message,
        "🎭 Autorol",
        `Uso: \`${PREFIX}autorole @rol\``,
        COLORS.red
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
    command === "autoroleremove"
  ) {

    config.autoRole = null;

    save();

    return reply(
      message,
      "🎭 Autorol",
      "Autorol desactivado.",
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
        "📢 Mensaje",
        `Uso: \`${PREFIX}${command} mensaje\``
      );
    }

    await message.delete().catch(() => {});

    return message.channel.send({
      content: clean(raw, 2000)
    });
  }

  if (command === "autoreplyadd") {

    const separator =
      raw.indexOf("|");

    if (separator === -1) {
      return reply(
        message,
        "🤖 Auto respuesta",
        `Uso: \`${PREFIX}autoreplyadd hola | ¡Hola!\``
      );
    }

    const trigger =
      raw.slice(0, separator).trim();

    const response =
      raw.slice(separator + 1).trim();

    if (!trigger || !response) {
      return reply(
        message,
        "🤖 Auto respuesta",
        "Debes indicar disparador y respuesta.",
        COLORS.red
      );
    }

    config.autoReplies.push({
      trigger,
      response
    });

    config.autoReplies =
      config.autoReplies.slice(-50);

    save();

    return reply(
      message,
      "🤖 Auto respuesta",
      `Respuesta automática añadida para **${trigger}**.`,
      COLORS.green
    );
  }

  if (command === "autoreplydel") {

    const trigger =
      raw.trim().toLowerCase();

    const before =
      config.autoReplies.length;

    config.autoReplies =
      config.autoReplies.filter(
        item =>
          item.trigger.toLowerCase() !==
          trigger
      );

    save();

    return reply(
      message,
      "🤖 Auto respuesta",
      before === config.autoReplies.length
        ? "No encontré esa respuesta."
        : "Respuesta eliminada.",
      COLORS.green
    );
  }

  if (command === "autoreplylist") {

    return reply(
      message,
      "🤖 Auto respuestas",
      config.autoReplies.length
        ? config.autoReplies
          .map(
            x =>
              `• **${x.trigger}** → ${x.response}`
          )
          .join("\n")
        : "No hay auto respuestas."
    );
  }

  if (command === "autoreactadd") {

    const separator =
      raw.indexOf("|");

    if (separator === -1) {
      return reply(
        message,
        "🤖 Auto reacción",
        `Uso: \`${PREFIX}autoreactadd hola | ❤️\``
      );
    }

    const trigger =
      raw.slice(0, separator).trim();

    const emoji =
      raw.slice(separator + 1).trim();

    if (!trigger || !emoji) {
      return reply(
        message,
        "🤖 Auto reacción",
        "Faltan datos.",
        COLORS.red
      );
    }

    config.autoReactions.push({
      trigger,
      emoji
    });

    config.autoReactions =
      config.autoReactions.slice(-50);

    save();

    return reply(
      message,
      "🤖 Auto reacción",
      `Se añadirá ${emoji} cuando aparezca **${trigger}**.`,
      COLORS.green
    );
  }

  if (command === "autoreactdel") {

    const trigger =
      raw.trim().toLowerCase();

    const before =
      config.autoReactions.length;

    config.autoReactions =
      config.autoReactions.filter(
        item =>
          item.trigger.toLowerCase() !==
          trigger
      );

    save();

    return reply(
      message,
      "🤖 Auto reacción",
      before === config.autoReactions.length
        ? "No encontré esa reacción."
        : "Reacción eliminada.",
      COLORS.green
    );
  }

  if (command === "autoreactlist") {

    return reply(
      message,
      "🤖 Auto reacciones",
      config.autoReactions.length
        ? config.autoReactions
          .map(
            x =>
              `• **${x.trigger}** → ${x.emoji}`
          )
          .join("\n")
        : "No hay auto reacciones."
    );
  }

  if (
    command === "clearlogs"
  ) {

    config.logChannel = null;

    save();

    return reply(
      message,
      "📋 Logs",
      "Canal de logs eliminado de la configuración.",
      COLORS.green
    );
  }

  if (
    command === "settings" ||
    command === "serverconfig" ||
    command === "config" ||
    command === "configinfo"
  ) {

    return reply(
      message,
      "⚙️ Configuración",
      [
        `📋 Logs: ${config.logChannel ? `<#${config.logChannel}>` : "No configurados"}`,
        `🔗 Anti-link: ${config.antiLink ? "ON" : "OFF"}`,
        `🚨 Anti-spam: ${config.antiSpam ? "ON" : "OFF"}`,
        `🌸 Welcome: ${config.welcome.enabled ? "ON" : "OFF"}`,
        `👋 Goodbye: ${config.goodbye.enabled ? "ON" : "OFF"}`,
        `🎭 Autorol: ${config.autoRole ? `<@&${config.autoRole}>` : "OFF"}`,
        `🤖 Auto respuestas: ${config.autoReplies.length}`,
        `🤖 Auto reacciones: ${config.autoReactions.length}`
      ].join("\n")
    );
  }

  if (
    command === "resetconfig" ||
    command === "reloadconfig"
  ) {

    if (command === "reloadconfig") {
      return reply(
        message,
        "⚙️ Configuración",
        "La configuración se carga automáticamente desde la base de datos."
      );
    }

    db.guilds[message.guild.id] = {
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
      autoReactions: [],
      stats: {
        messages: 0,
        joins: 0,
        leaves: 0
      }
    };

    save();

    return reply(
      message,
      "⚙️ Configuración",
      "Configuración restablecida.",
      COLORS.green
    );
  }

  if (
    command === "security" ||
    command === "securityinfo" ||
    command === "protection" ||
    command === "securitycheck"
  ) {

    return reply(
      message,
      "🔐 Seguridad",
      [
        `🔗 Anti-link: **${config.antiLink ? "ON" : "OFF"}**`,
        `🚨 Anti-spam: **${config.antiSpam ? "ON" : "OFF"}**`,
        `🛡️ Whitelist: **${config.whitelist.length}** usuarios`
      ].join("\n")
    );
  }

  if (
    command === "say" ||
    command === "announce"
  ) {
    return null;
  }

  if (
    command === "adminstats" ||
    command === "admininfo" ||
    command === "admincheck" ||
    command === "adminpanel"
  ) {

    return reply(
      message,
      "👑 Administración",
      [
        `👥 Miembros: **${message.guild.memberCount}**`,
        `📁 Canales: **${message.guild.channels.cache.size}**`,
        `🎭 Roles: **${message.guild.roles.cache.size}**`,
        `📋 Logs: ${config.logChannel ? "Configurados" : "No configurados"}`,
        `🔗 Anti-link: ${config.antiLink ? "ON" : "OFF"}`,
        `🚨 Anti-spam: ${config.antiSpam ? "ON" : "OFF"}`
      ].join("\n"),
      COLORS.purple
    );
  }

  return reply(
    message,
    "👑 Administración",
    `\`${PREFIX}${command}\` está configurado como comando administrativo.`
  );
}

// ============================================================
// 📊 ESTADÍSTICAS
// ============================================================

async function statsCommand(
  message,
  command
) {

  const config =
    guildData(message.guild.id);

  const user =
    userData(
      message.guild.id,
      message.author.id
    );

  if (
    command === "stats" ||
    command === "mystats" ||
    command === "userstats" ||
    command === "personalstats"
  ) {

    return reply(
      message,
      "📊 Tus estadísticas",
      [
        `💬 Mensajes: **${user.stats.messages}**`,
        `⚙️ Comandos: **${user.stats.commands}**`,
        `🎮 Juegos: **${user.stats.games}**`,
        `💰 Ganado: **${user.stats.earned}**`,
        `⭐ Nivel: **${user.level}**`,
        `✨ XP: **${user.xp}**`,
        `👍 Rep: **${user.rep}**`
      ].join("\n"),
      COLORS.cyan
    );
  }

  if (
    command === "serverstats" ||
    command === "statistics" ||
    command === "overview"
  ) {

    return reply(
      message,
      "📊 Estadísticas del servidor",
      [
        `👥 Miembros: **${message.guild.memberCount}**`,
        `📁 Canales: **${message.guild.channels.cache.size}**`,
        `🎭 Roles: **${message.guild.roles.cache.size}**`,
        `💬 Mensajes registrados: **${config.stats.messages}**`,
        `📥 Entradas: **${config.stats.joins}**`,
        `📤 Salidas: **${config.stats.leaves}**`
      ].join("\n"),
      COLORS.cyan
    );
  }

  if (
    command === "messages" ||
    command === "messagecount" ||
    command === "totalmessages"
  ) {

    return reply(
      message,
      "💬 Mensajes",
      `Mensajes registrados: **${config.stats.messages}**`
    );
  }

  if (
    command === "joins" ||
    command === "joinstats"
  ) {

    return reply(
      message,
      "📥 Entradas",
      `Entradas registradas: **${config.stats.joins}**`
    );
  }

  if (
    command === "leaves" ||
    command === "leavestats"
  ) {

    return reply(
      message,
      "📤 Salidas",
      `Salidas registradas: **${config.stats.leaves}**`
    );
  }

  if (
    command === "levels" ||
    command === "levelstats" ||
    command === "xpstats" ||
    command === "totalxp"
  ) {

    return reply(
      message,
      "⭐ XP",
      `Tu nivel: **${user.level}**\nTu XP: **${user.xp}**`
    );
  }

  if (
    command === "topxp" ||
    command === "rankstats"
  ) {

    const entries =
      Object.entries(
        db.users[message.guild.id] || {}
      )
      .map(([id, data]) => ({
        id,
        level: data.level || 1,
        xp: data.xp || 0
      }))
      .sort(
        (a, b) =>
          b.level - a.level ||
          b.xp - a.xp
      )
      .slice(0, 10);

    return reply(
      message,
      "🏆 Top XP",
      entries
        .map(
          (x, i) =>
            `**${i + 1}.** <@${x.id}> — Nivel ${x.level} (${x.xp} XP)`
        )
        .join("\n")
    );
  }

  if (
    command === "toprep" ||
    command === "repstats"
  ) {

    const entries =
      Object.entries(
        db.users[message.guild.id] || {}
      )
      .map(([id, data]) => ({
        id,
        rep: data.rep || 0
      }))
      .sort((a, b) => b.rep - a.rep)
      .slice(0, 10);

    return reply(
      message,
      "👍 Top reputación",
      entries
        .map(
          (x, i) =>
            `**${i + 1}.** <@${x.id}> — ${x.rep} rep`
        )
        .join("\n")
    );
  }

  if (
    command === "rolesstats" ||
    command === "rolestats"
  ) {

    return reply(
      message,
      "🎭 Roles",
      `Este servidor tiene **${message.guild.roles.cache.size} roles**.`
    );
  }

  if (
    command === "channelstats"
  ) {

    return reply(
      message,
      "📁 Canales",
      `Este servidor tiene **${message.guild.channels.cache.size} canales**.`
    );
  }

  return reply(
    message,
    "📊 Estadísticas",
    "No hay estadísticas adicionales para ese comando todavía."
  );
}

// ============================================================
// 🔧 UTILIDAD / INFORMACIÓN
// ============================================================

async function utilityCommand(
  message,
  command,
  args,
  raw
) {

  if (
    command === "ping"
  ) {
    return reply(
      message,
      "🏓 Pong",
      `Latencia: **${client.ws.ping}ms**`,
      COLORS.green
    );
  }

  if (
    command === "uptime"
  ) {

    const total =
      Math.floor(process.uptime());

    const days =
      Math.floor(total / 86400);

    const hours =
      Math.floor(total / 3600) % 24;

    const minutes =
      Math.floor(total / 60) % 60;

    const seconds =
      total % 60;

    return reply(
      message,
      "⏱️ Uptime",
      `**${days}d ${hours}h ${minutes}m ${seconds}s**`
    );
  }

  if (
    command === "botinfo" ||
    command === "madokami" ||
    command === "about"
  ) {

    return reply(
      message,
      "🌸 Madokami",
      [
        "🤖 Nombre: **Madokami**",
        `📌 Prefijo: \`${PREFIX}\``,
        "⚙️ Discord.js: **v14**",
        `🏠 Servidores: **${client.guilds.cache.size}**`,
        `📶 Ping: **${client.ws.ping}ms**`
      ].join("\n")
    );
  }

  if (
    command === "serverinfo" ||
    command === "server"
  ) {

    const guild =
      message.guild;

    return reply(
      message,
      "🏠 Servidor",
      [
        `🏠 **${guild.name}**`,
        `👥 Miembros: **${guild.memberCount}**`,
        `🎭 Roles: **${guild.roles.cache.size}**`,
        `📁 Canales: **${guild.channels.cache.size}**`,
        `😀 Emojis: **${guild.emojis.cache.size}**`,
        `🆔 ID: \`${guild.id}\``
      ].join("\n")
    );
  }

  if (
    command === "userinfo" ||
    command === "memberinfo"
  ) {

    const target =
      targetMember(message, args[0]) ||
      message.member;

    const data =
      userData(
        message.guild.id,
        target.id
      );

    return reply(
      message,
      "👤 Usuario",
      [
        `👤 Usuario: ${target}`,
        `🆔 ID: \`${target.id}\``,
        `⭐ Nivel: **${data.level}**`,
        `✨ XP: **${data.xp}**`,
        `👍 Rep: **${data.rep}**`,
        `⚠️ Warns: **${data.warnings.length}**`
      ].join("\n")
    );
  }

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

  if (
    command === "servericon" ||
    command === "icon"
  ) {

    if (!message.guild.iconURL()) {
      return reply(
        message,
        "🖼️ Icono",
        "El servidor no tiene icono."
      );
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLORS.pink)
          .setTitle(`🖼️ ${message.guild.name}`)
          .setImage(
            message.guild.iconURL({
              size: 1024
            })
          )
      ]
    });
  }

  if (
    command === "membercount" ||
    command === "members"
  ) {

    return reply(
      message,
      "👥 Miembros",
      `Este servidor tiene **${message.guild.memberCount} miembros**.`
    );
  }

  if (
    command === "roles" ||
    command === "rolelist"
  ) {

    const roles =
      message.guild.roles.cache
        .filter(r => r.id !== message.guild.id)
        .sort(
          (a, b) =>
            b.position - a.position
        )
        .map(r => `${r}`)
        .slice(0, 40);

    return reply(
      message,
      "🎭 Roles",
      roles.join("\n") ||
      "No hay roles."
    );
  }

  if (
    command === "channels" ||
    command === "channellist"
  ) {

    const channels =
      message.guild.channels.cache
        .filter(
          c =>
            c.type === ChannelType.GuildText ||
            c.type === ChannelType.GuildAnnouncement
        )
        .map(c => `${c}`)
        .slice(0, 50);

    return reply(
      message,
      "📁 Canales",
      channels.join("\n") ||
      "No hay canales."
    );
  }

  if (
    command === "calc"
  ) {

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

      const result =
        Function(
          `"use strict"; return (${raw})`
        )();

      if (
        typeof result !== "number" ||
        !Number.isFinite(result)
      ) {
        throw new Error();
      }

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

  if (
    command === "choose" ||
    command === "pick"
  ) {

    const choices =
      raw
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
      `Elegí: **${
        choices[
          Math.floor(
            Math.random() * choices.length
          )
        ]
      }**`
    );
  }

  if (
    command === "random" ||
    command === "number"
  ) {

    let min =
      Number(args[0]);

    let max =
      Number(args[1]);

    if (!Number.isFinite(min)) min = 1;
    if (!Number.isFinite(max)) max = 100;

    if (min > max) {
      [min, max] = [max, min];
    }

    const number =
      Math.floor(
        Math.random() *
        (max - min + 1)
      ) + min;

    return reply(
      message,
      "🎲 Random",
      `Número: **${number}**`
    );
  }

  if (
    command === "reverse"
  ) {
    return reply(
      message,
      "🔄 Reverse",
      raw
        ? raw.split("").reverse().join("")
        : "Escribe un texto."
    );
  }

  if (
    command === "uppercase"
  ) {
    return reply(
      message,
      "🔠 Mayúsculas",
      raw
        ? raw.toUpperCase()
        : "Escribe un texto."
    );
  }

  if (
    command === "lowercase"
  ) {
    return reply(
      message,
      "🔡 Minúsculas",
      raw
        ? raw.toLowerCase()
        : "Escribe un texto."
    );
  }

  if (
    command === "length"
  ) {
    return reply(
      message,
      "📏 Longitud",
      `Caracteres: **${raw.length}**`
    );
  }

  if (
    command === "wordcount"
  ) {
    return reply(
      message,
      "📝 Palabras",
      `Palabras: **${
        raw.trim()
          ? raw.trim().split(/\s+/).length
          : 0
      }**`
    );
  }

  if (
    command === "date"
  ) {
    return reply(
      message,
      "📅 Fecha",
      new Date().toLocaleDateString("es-ES")
    );
  }

  if (
    command === "time"
  ) {
    return reply(
      message,
      "🕐 Hora",
      new Date().toLocaleTimeString("es-ES")
    );
  }

  if (
    command === "myid" ||
    command === "id"
  ) {
    return reply(
      message,
      "🆔 ID",
      `Tu ID es \`${message.author.id}\``
    );
  }

  if (
    command === "serverid" ||
    command === "guildid"
  ) {
    return reply(
      message,
      "🆔 ID del servidor",
      `\`${message.guild.id}\``
    );
  }

  if (
    command === "permissions"
  ) {
    return reply(
      message,
      "🔐 Permisos",
      message.member.permissions
        .toArray()
        .map(x => `• ${x}`)
        .join("\n")
    );
  }

  if (
    command === "online"
  ) {

    const online =
      message.guild.members.cache
        .filter(
          m =>
            m.presence &&
            m.presence.status !== "offline"
        )
        .size;

    return reply(
      message,
      "🟢 Online",
      `Miembros online detectados: **${online}**`
    );
  }

  if (
    command === "status" ||
    command === "botstatus"
  ) {

    return reply(
      message,
      "📡 Estado",
      `🟢 Online\n🏠 Servidores: **${client.guilds.cache.size}**\n📶 Ping: **${client.ws.ping}ms**`
    );
  }

  if (
    command === "prefix" ||
    command === "prefixinfo"
  ) {

    return reply(
      message,
      "📌 Prefijo",
      `El prefijo de Madokami es \`${PREFIX}\`.`
    );
  }

  if (
    command === "owner" ||
    command === "serverowner"
  ) {

    const owner =
      await message.guild.fetchOwner()
        .catch(() => null);

    return reply(
      message,
      "👑 Propietario",
      owner
        ? `${owner.user.tag}`
        : "No pude obtener el propietario."
    );
  }

  if (
    command === "created" ||
    command === "servercreated"
  ) {

    return reply(
      message,
      "📅 Creación",
      `<t:${Math.floor(
        message.guild.createdTimestamp / 1000
      )}:F>`
    );
  }

  if (
    command === "joined"
  ) {

    return reply(
      message,
      "📅 Entrada",
      message.member.joinedTimestamp
        ? `<t:${Math.floor(
            message.member.joinedTimestamp / 1000
          )}:F>`
        : "No disponible."
    );
  }

  if (
    command === "invite"
  ) {

    return reply(
      message,
      "🔗 Invitación",
      "Usa el enlace de instalación de la aplicación de Discord para invitar a Madokami."
    );
  }

  return null;
}

// ============================================================
// 🧩 COMMAND MAP
// ============================================================

const commandCategory = new Map();

for (const category of Object.values(CATEGORIES)) {
  for (const [command] of category.commands) {
    if (!commandCategory.has(command)) {
      commandCategory.set(command, category.name);
    }
  }
}

const adminCommandSet = new Set(
  Object.values(ADMIN_CATEGORIES)
    .flatMap(category => category.commands)
);

const ALL_COMMANDS =
  new Set([
    "help",
    "helpad",
    ...commandCategory.keys(),
    ...adminCommandSet
  ]);

// ============================================================
// 💬 MESSAGE CREATE
// ============================================================

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

    config.stats.messages++;
    user.stats.messages++;

    // ================================================
    // 🚨 ANTI-SPAM
    // ================================================

    if (
      config.antiSpam &&
      !isAdmin(message) &&
      !config.whitelist.includes(message.author.id)
    ) {

      const key =
        `${message.guild.id}:${message.author.id}`;

      const now =
        Date.now();

      const times =
        (spamTracker.get(key) || [])
          .filter(
            time =>
              now - time < 7000
          );

      times.push(now);

      spamTracker.set(
        key,
        times
      );

      if (times.length >= 6) {

        spamTracker.set(key, []);

        await message.delete()
          .catch(() => {});

        const warning =
          await message.channel.send({
            content:
              `🚨 <@${message.author.id}> no hagas spam.`
          })
          .catch(() => null);

        if (warning) {
          setTimeout(
            () =>
              warning.delete()
                .catch(() => {}),
            5000
          );
        }

        await sendLog(
          message.guild,
          "🚨 Anti-spam",
          `${message.author.tag} superó el límite de mensajes.`,
          COLORS.red
        );

        save();

        return;
      }
    }

    // ================================================
    // 🔗 ANTI-LINK
    // ================================================

    if (
      config.antiLink &&
      !isAdmin(message) &&
      !config.whitelist.includes(message.author.id) &&
      /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i
        .test(message.content)
    ) {

      await message.delete()
        .catch(() => {});

      const timed =
        await message.member
          .timeout(
            2 * 60 * 60 * 1000,
            "Madokami Anti-link"
          )
          .then(() => true)
          .catch(() => false);

      const warning =
        await message.channel.send({
          content:
            `🔗 <@${message.author.id}> no puedes enviar enlaces aquí.${timed ? " Timeout: **2 horas**." : ""}`
        })
        .catch(() => null);

      if (warning) {
        setTimeout(
          () =>
            warning.delete()
              .catch(() => {}),
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

    // ================================================
    // 🤖 AUTO RESPUESTAS
    // ================================================

    for (
      const item of config.autoReplies
    ) {

      if (
        message.content
          .toLowerCase()
          .includes(
            item.trigger.toLowerCase()
          )
      ) {

        await message.channel
          .send(
            clean(item.response)
          )
          .catch(() => {});

        break;
      }
    }

    // ================================================
    // 🤖 AUTO REACCIONES
    // ================================================

    for (
      const item of config.autoReactions
    ) {

      if (
        message.content
          .toLowerCase()
          .includes(
            item.trigger.toLowerCase()
          )
      ) {

        await message
          .react(item.emoji)
          .catch(() => {});
      }
    }

    // ================================================
    // ⭐ XP
    // ================================================

    if (
      !message.content.startsWith(PREFIX)
    ) {

      if (
        Math.random() < 0.10
      ) {

        const leveled =
          addXP(
            message.guild.id,
            message.author.id,
            5
          );

        if (leveled) {

          const level =
            userData(
              message.guild.id,
              message.author.id
            ).level;

          const levelMessage =
            await message.channel
              .send(
                `⭐ <@${message.author.id}> subió al nivel **${level}**.`
              )
              .catch(() => null);

          if (levelMessage) {
            setTimeout(
              () =>
                levelMessage.delete()
                  .catch(() => {}),
              5000
            );
          }
        }
      }

      save();

      return;
    }

    // ================================================
    // 📌 PARSE COMMAND
    // ================================================

    const body =
      message.content
        .slice(PREFIX.length)
        .trim();

    if (!body) return;

    const parts =
      body.split(/\s+/);

    const command =
      parts.shift()
        .toLowerCase();

    const raw =
      parts.join(" ");

    if (!ALL_COMMANDS.has(command)) {

      return reply(
        message,
        "❌ Comando no encontrado",
        `No existe \`${PREFIX}${command}\`.\nUsa \`${PREFIX}help\`.`,
        COLORS.red
      );
    }

    user.stats.commands++;

    save();

    // ================================================
    // HELP
    // ================================================

    if (command === "help") {
      return showHelp(message);
    }

    if (command === "helpad") {
      return showAdminHelp(message);
    }

    try {

      // ADMIN
      if (adminCommandSet.has(command)) {
        return await adminCommand(
          message,
          command,
          parts,
          raw
        );
      }

      // MODERATION
      if (
        [
          "ban",
          "unban",
          "kick",
          "mute",
          "unmute",
          "timeout",
          "untimeout",
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
          "roleinfo"
        ].includes(command)
      ) {
        return await moderationCommand(
          message,
          command,
          parts
        );
      }

      // ECONOMY
      const economyResult =
        await economyCommand(
          message,
          command,
          parts,
          user
        );

      if (economyResult) {
        return economyResult;
      }

      // SOCIAL
      const socialResult =
        await socialCommand(
          message,
          command,
          parts,
          user
        );

      if (socialResult) {
        return socialResult;
      }

      // GAMES
      const gameResult =
        await gameCommand(
          message,
          command,
          parts,
          raw
        );

      if (gameResult) {
        user.stats.games++;
        save();
        return gameResult;
      }

      // STATS
      if (
        [
          "stats",
          "mystats",
          "serverstats",
          "memberstats",
          "messages",
          "messagecount",
          "activity",
          "levels",
          "levelstats",
          "xpstats",
          "rankstats",
          "topxp",
          "toprep",
          "joins",
          "leaves",
          "rolesstats",
          "rolestats",
          "channelstats",
          "totalmessages",
          "totalxp",
          "statistics",
          "overview"
        ].includes(command)
      ) {
        return await statsCommand(
          message,
          command
        );
      }

      // UTILITY / INFO
      const utilityResult =
        await utilityCommand(
          message,
          command,
          parts,
          raw
        );

      if (utilityResult) {
        return utilityResult;
      }

      // SOCIAL / REWARD / ACHIEVEMENT /
      // CUSTOMIZATION / INFORMATION fallback
      return reply(
        message,
        "🌸 Madokami",
        `\`${PREFIX}${command}\` está disponible.\nUsa \`${PREFIX}help\` para consultar su categoría.`
      );

    } catch (error) {

      console.error(
        `❌ Error en ${command}:`,
        error
      );

      return reply(
        message,
        "❌ Error",
        "Ocurrió un error ejecutando este comando. Revisa la consola de Render.",
        COLORS.red
      ).catch(() => {});
    }
  }
);

// ============================================================
// 🖱️ INTERACTIONS
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    // ================================================
    // 📚 NORMAL HELP CATEGORY
    // ================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "madokami_category"
    ) {

      const key =
        interaction.values[0];

      return interaction.update({
        embeds: [
          categoryEmbed(key, 1)
        ],
        components: [
          helpMenu()[0],
          categoryButtons(key, 1)
        ]
      });
    }

    // ================================================
    // 📖 NORMAL HELP BUTTONS
    // ================================================

    if (
      interaction.isButton() &&
      interaction.customId.startsWith(
        "madokami_"
      )
    ) {

      const [
        action,
        key,
        pageText
      ] =
        interaction.customId.split(":");

      const page =
        Number(pageText);

      if (
        action ===
        "madokami_home"
      ) {

        return interaction.update({
          embeds: [
            homeEmbed()
          ],
          components: helpMenu()
        });
      }

      if (
        action ===
        "madokami_prev"
      ) {

        return interaction.update({
          embeds: [
            categoryEmbed(
              key,
              Math.max(1, page - 1)
            )
          ],
          components: [
            helpMenu()[0],
            categoryButtons(
              key,
              Math.max(1, page - 1)
            )
          ]
        });
      }

      if (
        action ===
        "madokami_next"
      ) {

        return interaction.update({
          embeds: [
            categoryEmbed(
              key,
              Math.min(2, page + 1)
            )
          ],
          components: [
            helpMenu()[0],
            categoryButtons(
              key,
              Math.min(2, page + 1)
            )
          ]
        });
      }
    }

    // ================================================
    // 👑 ADMIN HELP
    // ================================================

    if (
      interaction.isStringSelectMenu() &&
      interaction.customId ===
        "madokami_admin_category"
    ) {

      if (!isAdmin(interaction)) {
        return interaction.reply({
          content:
            "🔒 Solo administradores.",
          ephemeral: true
        });
      }

      const key =
        interaction.values[0];

      return interaction.update({
        embeds: [
          adminCategoryEmbed(key)
        ],
        components: adminMenu()
      });
    }
  }
);

// ============================================================
// 🗑️ LOG MESSAGE DELETE
// ============================================================

client.on(
  "messageDelete",
  message => {

    if (!message.guild) return;
    if (message.author?.bot) return;

    sendLog(
      message.guild,
      "🗑️ Mensaje eliminado",
      [
        `Autor: **${message.author?.tag || "Desconocido"}**`,
        `Canal: <#${message.channel?.id || "0"}>`,
        `Contenido: ${message.content || "[no disponible]"}`
      ].join("\n"),
      COLORS.red
    );
  }
);

// ============================================================
// ✏️ LOG MESSAGE EDIT
// ============================================================

client.on(
  "messageUpdate",
  (oldMessage, newMessage) => {

    if (!newMessage.guild) return;
    if (newMessage.author?.bot) return;

    if (
      oldMessage.content ===
      newMessage.content
    ) {
      return;
    }

    sendLog(
      newMessage.guild,
      "✏️ Mensaje editado",
      [
        `Autor: **${newMessage.author?.tag || "Desconocido"}**`,
        "",
        "**Antes:**",
        oldMessage.content || "[sin caché]",
        "",
        "**Después:**",
        newMessage.content || "[sin caché]"
      ].join("\n"),
      COLORS.gold
    );
  }
);

// ============================================================
// 👋 MEMBERS
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const config =
      guildData(member.guild.id);

    config.stats.joins++;

    // AUTOROL
    if (config.autoRole) {

      const role =
        member.guild.roles.cache.get(
          config.autoRole
        );

      if (role) {
        await member.roles
          .add(role)
          .catch(error =>
            console.error(
              "Error autorol:",
              error
            )
          );
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

      if (
        channel &&
        channel.isTextBased()
      ) {

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

        await channel
          .send({
            content: clean(text)
          })
          .catch(error =>
            console.error(
              "Error welcome:",
              error
            )
          );
      }
    }

    await sendLog(
      member.guild,
      "📥 Miembro entró",
      `${member.user.tag} (${member.id})`,
      COLORS.green
    );

    save();
  }
);

// ============================================================
// 👋 MEMBER REMOVE
// ============================================================

client.on(
  "guildMemberRemove",
  async member => {

    const config =
      guildData(member.guild.id);

    config.stats.leaves++;

    if (
      config.goodbye.enabled &&
      config.goodbye.channel
    ) {

      const channel =
        member.guild.channels.cache.get(
          config.goodbye.channel
        );

      if (
        channel &&
        channel.isTextBased()
      ) {

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
            );

        await channel
          .send({
            content: clean(text)
          })
          .catch(() => {});
      }
    }

    await sendLog(
      member.guild,
      "📤 Miembro salió",
      `${member.user?.tag || member.id}`,
      COLORS.red
    );

    save();
  }
);

// ============================================================
// 🎭 ROLE LOGS
// ============================================================

client.on(
  "roleCreate",
  role => {

    sendLog(
      role.guild,
      "🎭 Rol creado",
      `Rol: **${role.name}**\nID: \`${role.id}\``,
      COLORS.green
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
  (oldRole, newRole) => {

    if (
      oldRole.name === newRole.name &&
      oldRole.hexColor === newRole.hexColor
    ) {
      return;
    }

    sendLog(
      newRole.guild,
      "🎨 Rol actualizado",
      [
        `Antes: **${oldRole.name}**`,
        `Después: **${newRole.name}**`
      ].join("\n")
    );
  }
);

// ============================================================
// 📁 CHANNEL LOGS
// ============================================================

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
  (oldChannel, newChannel) => {

    if (!newChannel.guild) return;

    if (
      oldChannel.name ===
      newChannel.name
    ) {
      return;
    }

    sendLog(
      newChannel.guild,
      "✏️ Canal actualizado",
      [
        `Antes: **${oldChannel.name}**`,
        `Después: **${newChannel.name}**`
      ].join("\n")
    );
  }
);

// ============================================================
// 🎭 MEMBER UPDATE
// ============================================================

client.on(
  "guildMemberUpdate",
  (oldMember, newMember) => {

    if (
      oldMember.nickname !==
      newMember.nickname
    ) {

      sendLog(
        newMember.guild,
        "🏷️ Apodo actualizado",
        [
          newMember.user.tag,
          `Antes: ${oldMember.nickname || "ninguno"}`,
          `Después: ${newMember.nickname || "ninguno"}`
        ].join("\n")
      );
    }

    const oldRoles =
      new Set(
        oldMember.roles.cache.keys()
      );

    const newRoles =
      new Set(
        newMember.roles.cache.keys()
      );

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

    if (
      added.length ||
      removed.length
    ) {

      sendLog(
        newMember.guild,
        "🎭 Roles modificados",
        [
          newMember.user.tag,
          `Añadidos: ${
            added.map(
              id => `<@&${id}>`
            ).join(", ") ||
            "ninguno"
          }`,
          `Quitados: ${
            removed.map(
              id => `<@&${id}>`
            ).join(", ") ||
            "ninguno"
          }`
        ].join("\n")
      );
    }
  }
);

// ============================================================
// 🚀 READY
// ============================================================

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

// ============================================================
// 🔑 LOGIN
// ============================================================

if (!process.env.DISCORD_TOKEN) {

  console.error(
    "❌ Falta DISCORD_TOKEN en las variables de entorno."
  );

  process.exit(1);
}

client.login(
  process.env.DISCORD_TOKEN
)
.catch(error => {

  console.error(
    "❌ Error iniciando sesión:",
    error
  );

  process.exit(1);
});
