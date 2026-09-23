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
  AttachmentBuilder
} = require("discord.js");

const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const fs = require("fs");
const path = require("path");

const PREFIX = "m!";
const PORT = process.env.PORT || 10000;
const DATA_FILE = path.join(__dirname, "madokami-data.json");

const GEMINI_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash";

const GEMINI_IMAGE_MODEL =
  process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";

// ============================================================
// 🌐 WEB SERVER — RENDER
// ============================================================

const app = express();

app.get("/", (_, res) =>
  res.status(200).send("🌸 Madokami online.")
);

app.get("/health", (_, res) =>
  res.json({ ok: true, bot: "Madokami" })
);

app.listen(PORT, "0.0.0.0", () =>
  console.log(`🌐 Web server activo en ${PORT}`)
);

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
} catch (err) {
  console.error("❌ Error cargando datos:", err.message);
}

function save() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(db, null, 2)
    );
  } catch (err) {
    console.error("❌ Error guardando datos:", err.message);
  }
}

function gdata(id) {
  if (!db.guilds[id]) {
    db.guilds[id] = {
      logChannel: null,

      antiLink: false,
      antiSpam: false,

      whitelist: [],

      autoReplies: [],
      autoReacts: [],

      welcome: {
        enabled: false,
        channel: null,
        text: "🌸 Bienvenido {user} a **{server}**."
      },

      goodbye: {
        enabled: false,
        channel: null,
        text: "👋 **{user}** salió de **{server}**."
      },

      autorole: null,

      reactionRoles: {},

      botStatus: "m!help"
    };
  }

  return db.guilds[id];
}

function udata(gid, uid) {
  if (!db.users[gid]) {
    db.users[gid] = {};
  }

  if (!db.users[gid][uid]) {
    db.users[gid][uid] = {
      balance: 1000,
      bank: 0,
      inventory: {},
      xp: 0,
      level: 1,
      warnings: [],
      rep: 0,
      bio: "",
      afk: false,
      afkText: "",
      birthday: "",
      timezone: "UTC",
      notes: [],
      last: {},
      streak: 0
    };
  }

  return db.users[gid][uid];
}

// ============================================================
// 🧰 FUNCIONES
// ============================================================

function rand(min, max) {
  return Math.floor(
    Math.random() * (max - min + 1)
  ) + min;
}

function money(n) {
  return `${Math.max(
    0,
    Math.floor(n)
  ).toLocaleString("es-ES")} 💰`;
}

function clean(text, max = 1900) {
  text = String(text ?? "");

  return text.length > max
    ? text.slice(0, max - 3) + "..."
    : text;
}

function admin(message) {
  return message.member?.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function manage(message) {
  return (
    admin(message) ||
    message.member?.permissions.has(
      PermissionsBitField.Flags.ManageGuild
    )
  );
}

function targetMember(message, input) {
  if (!input) return null;

  const id = input.replace(/[<@!>]/g, "");

  return (
    message.guild.members.cache.get(id) ||
    null
  );
}

function targetRole(guild, input) {
  if (!input) return null;

  const id = input.replace(/[<@&>]/g, "");

  return (
    guild.roles.cache.get(id) ||
    guild.roles.cache.find(
      r =>
        r.name.toLowerCase() ===
        String(input).toLowerCase()
    ) ||
    null
  );
}

function isWhite(guildId, userId) {
  return gdata(guildId).whitelist.includes(userId);
}

function cooldown(user, key, ms) {
  const remaining =
    ms - (Date.now() - (user.last[key] || 0));

  if (remaining > 0) {
    return Math.ceil(remaining / 1000);
  }

  user.last[key] = Date.now();
  save();

  return 0;
}

function addMoney(user, amount) {
  user.balance = Math.max(
    0,
    user.balance + amount
  );

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

async function log(guild, title, description) {
  const data = gdata(guild.id);

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
          .setDescription(clean(description, 3900))
          .setTimestamp()
      ]
    });
  } catch {}
}

// ============================================================
// 🤖 GEMINI
// ============================================================

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    })
  : null;

async function askAI(prompt) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const result =
    await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt
    });

  return result.text ||
    "Gemini no devolvió texto.";
}

async function makeImage(prompt) {
  if (!ai) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const result =
    await ai.models.generateContent({
      model: GEMINI_IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    });

  const part =
    result.candidates?.[0]?.content?.parts?.find(
      p => p.inlineData?.data
    );

  if (!part) {
    throw new Error("IMAGE_NOT_RETURNED");
  }

  return Buffer.from(
    part.inlineData.data,
    "base64"
  );
}

// ============================================================
// 📚 CATEGORÍAS
// ============================================================

const CATS = {

  economia: {
    name: "💰 Economía",
    color: 0xf1c40f,
    cmds: [
      ["balance","Ver saldo"],
      ["daily","Recompensa diaria"],
      ["work","Trabajar"],
      ["job","Cobrar trabajo"],
      ["salary","Cobrar salario"],
      ["beg","Pedir ayuda"],
      ["fish","Pescar"],
      ["mine","Minar"],
      ["farm","Trabajar en granja"],
      ["cook","Cocinar"],
      ["sell","Vender"],
      ["inventory","Inventario"],
      ["shop","Tienda"],
      ["buy","Comprar"],
      ["deposit","Depositar"],
      ["withdraw","Retirar"],
      ["pay","Pagar"],
      ["give","Dar dinero"],
      ["leaderboard","Ranking"],
      ["quest","Misión"],
      ["streak","Racha"],
      ["bonus","Bono"],
      ["recycle","Reciclar"],
      ["collect","Recolectar"],
      ["craft","Fabricar"],
      ["bank","Banco"],
      ["interest","Interés"],
      ["networth","Patrimonio"],
      ["economy","Resumen"],
      ["crime","Riesgo ficticio"]
    ]
  },

  moderacion: {
    name: "🛡️ Moderación",
    color: 0xe74c3c,
    cmds: [
      ["ban","Banear"],
      ["unban","Desbanear"],
      ["kick","Expulsar"],
      ["timeout","Timeout"],
      ["untimeout","Quitar timeout"],
      ["mute","Mute"],
      ["unmute","Unmute"],
      ["warn","Advertir"],
      ["unwarn","Quitar advertencia"],
      ["warnings","Ver advertencias"],
      ["clear","Borrar mensajes"],
      ["slowmode","Slowmode"],
      ["lock","Bloquear canal"],
      ["unlock","Desbloquear canal"],
      ["nick","Cambiar apodo"],
      ["purgebots","Borrar bots"],
      ["purgeuser","Borrar usuario"],
      ["roleadd","Dar rol"],
      ["roleremove","Quitar rol"],
      ["rolecreate","Crear rol"],
      ["roledelete","Eliminar rol"],
      ["roleinfo","Info de rol"],
      ["channelinfo","Info de canal"],
      ["channelcreate","Crear canal"],
      ["channeldelete","Eliminar canal"],
      ["channelrename","Renombrar canal"],
      ["lockall","Bloquear canales"],
      ["unlockall","Desbloquear canales"],
      ["modstats","Estadísticas"],
      ["modhelp","Ayuda"]
    ]
  },

  utilidad: {
    name: "🔧 Utilidad",
    color: 0x3498db,
    cmds: [
      ["ping","Latencia"],
      ["uptime","Tiempo activo"],
      ["botinfo","Información"],
      ["serverinfo","Servidor"],
      ["userinfo","Usuario"],
      ["avatar","Avatar"],
      ["servericon","Icono"],
      ["roles","Roles"],
      ["channels","Canales"],
      ["membercount","Miembros"],
      ["channel","Canal"],
      ["role","Rol"],
      ["emoji","Emoji"],
      ["calc","Calculadora"],
      ["choose","Elegir"],
      ["random","Aleatorio"],
      ["reverse","Invertir"],
      ["uppercase","Mayúsculas"],
      ["lowercase","Minúsculas"],
      ["poll","Encuesta"],
      ["remind","Recordatorio"],
      ["timestamp","Timestamp"],
      ["permissions","Permisos"],
      ["joined","Entrada"],
      ["invite","Invitación"],
      ["textstats","Stats"],
      ["wordcount","Palabras"],
      ["serverid","ID servidor"],
      ["userinfo2","Ficha"],
      ["help","Ayuda"]
    ]
  },

  diversion: {
    name: "🎮 Diversión",
    color: 0x9b59b6,
    cmds: [
      ["8ball","8ball"],
      ["coinflip","Cara o cruz"],
      ["dice","Dado"],
      ["roll","Dados"],
      ["rps","Piedra papel tijera"],
      ["trivia","Trivia"],
      ["guess","Adivina"],
      ["joke","Chiste"],
      ["compliment","Cumplido"],
      ["roast","Broma"],
      ["fact","Dato"],
      ["fortune","Fortuna"],
      ["emojify","Emojis"],
      ["scramble","Desordenar"],
      ["anagram","Anagrama"],
      ["ascii","Texto"],
      ["mock","Mock"],
      ["wyr","Qué prefieres"],
      ["riddle","Acertijo"],
      ["pun","Juego de palabras"],
      ["quote","Frase"],
      ["dadjoke","Chiste malo"],
      ["binary","Binario"],
      ["morse","Morse"],
      ["vowels","Vocales"],
      ["count","Contar"],
      ["echo","Repetir"],
      ["color","Color"],
      ["mathgame","Reto matemático"],
      ["funhelp","Ayuda"]
    ]
  },

  social: {
    name: "👥 Social",
    color: 0x2ecc71,
    cmds: [
      ["profile","Perfil"],
      ["rep","Reputación"],
      ["bio","Bio"],
      ["setbio","Cambiar bio"],
      ["level","Nivel"],
      ["xp","XP"],
      ["rank","Rango"],
      ["top","Top XP"],
      ["afk","AFK"],
      ["setafk","Mensaje AFK"],
      ["birthday","Cumpleaños"],
      ["setbirthday","Guardar cumpleaños"],
      ["timezone","Zona horaria"],
      ["settimezone","Guardar zona"],
      ["social","Resumen social"],
      ["joined","Entrada"],
      ["rolesme","Mis roles"],
      ["serverprofile","Perfil servidor"],
      ["colorprofile","Color"],
      ["setcolor","Guardar color"],
      ["notes","Notas"],
      ["note","Añadir nota"],
      ["clearnotes","Borrar notas"],
      ["members","Miembros"],
      ["online","Online"],
      ["oldest","Más antiguo"],
      ["newest","Más reciente"],
      ["repboard","Top reputación"],
      ["socialhelp","Ayuda"],
      ["mydata","Mis datos"]
    ]
  },

  admin: {
    name: "👑 Administración",
    color: 0x5865f2,
    cmds: [
      ["setup","Configuración"],
      ["log","Logs"],
      ["antilink","Anti-links"],
      ["antispam","Anti-spam"],
      ["whitelist","Lista blanca"],
      ["say","Mensaje del bot"],
      ["announce","Anuncio"],
      ["autoreplyadd","Añadir autorespuesta"],
      ["autoreplydel","Borrar autorespuesta"],
      ["autoreplylist","Listar autorespuestas"],
      ["autoreplyclear","Borrar autorespuestas"],
      ["autoreactadd","Añadir reacción"],
      ["autoreactdel","Borrar reacción"],
      ["autoreactlist","Listar reacciones"],
      ["autoreactclear","Borrar reacciones"],
      ["welcome","Bienvenida"],
      ["welcomechannel","Canal bienvenida"],
      ["welcomemessage","Mensaje bienvenida"],
      ["goodbye","Despedida"],
      ["goodbyechannel","Canal despedida"],
      ["goodbyemessage","Mensaje despedida"],
      ["autorole","Rol automático"],
      ["reactionroleadd","Reaction role"],
      ["reactionroledel","Borrar reaction role"],
      ["reactionrolelist","Lista reaction roles"],
      ["lockall","Bloquear todos"],
      ["unlockall","Desbloquear todos"],
      ["config","Configuración"],
      ["resetconfig","Restablecer"],
      ["status","Estado"]
    ]
  },

  ia: {
    name: "🤖 Madokami AI",
    color: 0xff69b4,
    cmds: [
      ["ia","IA general"],
      ["ask","Pregunta"],
      ["imagen","Generar imagen"],
      ["resumir","Resumir"],
      ["traducir","Traducir"],
      ["explicar","Explicar"],
      ["codigo","Código"],
      ["corregir","Corregir código"],
      ["matematicas","Matemáticas"],
      ["ideas","Ideas"],
      ["estudiar","Estudiar"],
      ["quizai","Crear quiz"],
      ["tarjetas","Tarjetas"],
      ["reescribir","Reescribir"],
      ["corregirtexto","Ortografía"],
      ["titulo","Títulos"],
      ["esquema","Esquema"],
      ["definir","Definir"],
      ["ejemplos","Ejemplos"],
      ["simplificar","Simplificar"],
      ["comparar","Comparar"],
      ["proscontras","Pros y contras"],
      ["pasos","Pasos"],
      ["correo","Correo"],
      ["programar","Programar"],
      ["debug","Debug"],
      ["regex","Regex"],
      ["sql","SQL"],
      ["json","JSON"],
      ["prompt","Mejorar prompt"]
    ]
  }

};

// ============================================================
// 🗺️ MAPA DE COMANDOS
// ============================================================

const COMMANDS = new Map();

for (const [category, data] of Object.entries(CATS)) {
  for (const [name, description] of data.cmds) {
    COMMANDS.set(name, {
      category,
      description
    });
  }
}

function findCategory(command) {
  return COMMANDS.get(command)?.category;
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
// 🌸 HELP
// ============================================================

function helpEmbed(category = "home") {

  if (category === "home") {
    return new EmbedBuilder()
      .setColor(0xff69b4)
      .setTitle("🌸 MADOKAMI • CENTRO DE AYUDA")
      .setDescription(
        [
          "╭───────────────╮",
          "🌸 **Bienvenido a Madokami**",
          "╰───────────────╯",
          "",
          "Selecciona una categoría en el menú.",
          "",
          "💰 Economía — 30 comandos",
          "🛡️ Moderación — 30 comandos",
          "🔧 Utilidad — 30 comandos",
          "🎮 Diversión — 30 comandos",
          "👥 Social — 30 comandos",
          "👑 Administración — 30 comandos",
          "🤖 Madokami AI — 30 comandos",
          "",
          "🌌 Prefix: `m!`",
          "👑 Panel administrativo: `m!helpad`"
        ].join("\n")
      )
      .setFooter({
        text: "🌸 Madokami • Selecciona una categoría"
      })
      .setTimestamp();
  }

  const categoryData = CATS[category];

  const lines = categoryData.cmds.map(
    ([command, description], index) =>
      `**${index + 1}.** \`m!${command}\` — ${description}`
  );

  return new EmbedBuilder()
    .setColor(categoryData.color)
    .setTitle(
      `${categoryData.name} • 30 comandos`
    )
    .setDescription(lines.join("\n"))
    .setFooter({
      text: "🌸 Usa m!help para volver al menú."
    })
    .setTimestamp();
}

function helpRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_help")
      .setPlaceholder("🌸 Selecciona una categoría")
      .addOptions(
        Object.entries(CATS).map(
          ([key, data]) => ({
            label: data.name.replace(
              /^[^ ]+ /,
              ""
            ),
            value: key,
            description: "30 comandos"
          })
        )
      )
  );
}

// ============================================================
// ⚙️ EJECUCIÓN DE COMANDOS
// ============================================================

async function executeCommand(
  message,
  command,
  args,
  raw
) {

  const guildId = message.guild.id;

  const user = udata(
    guildId,
    message.author.id
  );

  const guildData = gdata(guildId);

  // Decoración automática
  const originalReply =
    message.reply.bind(message);

  message.reply = async payload => {

    const category =
      findCategory(command);

    const color =
      CATS[category]?.color ||
      0xff69b4;

    const title =
      `🌸 Madokami • ${
        CATS[category]?.name ||
        "Madokami"
      }`;

    if (typeof payload === "string") {

      return originalReply({
        embeds: [
          new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(
              clean(payload, 3900)
            )
            .setFooter({
              text:
                "Usa m!help para ver todos los comandos."
            })
            .setTimestamp()
        ],
        allowedMentions: {
          repliedUser: false
        }
      });
    }

    return originalReply(payload);
  };

  // ========================================================
  // 👑 ADMIN ONLY
  // ========================================================

  const adminCommand =
    CATS.admin.cmds.some(
      x => x[0] === command
    );

  if (
    adminCommand &&
    !admin(message)
  ) {
    return message.reply(
      "❌ Necesitas permisos de **Administrador**."
    );
  }

  // ========================================================
  // 🌸 HELP
  // ========================================================

  if (command === "help") {
    return message.reply({
      embeds: [helpEmbed()],
      components: [helpRow()]
    });
  }

  // ========================================================
  // 🔧 UTILIDAD
  // ========================================================

  if (command === "ping")
    return message.reply(
      `🏓 Pong: **${client.ws.ping}ms**`
    );

  if (command === "uptime") {

    const total =
      Math.floor(client.uptime / 1000);

    const hours =
      Math.floor(total / 3600);

    const minutes =
      Math.floor((total % 3600) / 60);

    const seconds =
      total % 60;

    return message.reply(
      `⏱️ Uptime: **${hours}h ${minutes}m ${seconds}s**`
    );
  }

  if (command === "botinfo") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff69b4)
          .setTitle("🌸 MADOKAMI")
          .setDescription(
            "Bot multipropósito para Discord."
          )
          .addFields(
            {
              name: "🌌 Prefix",
              value: "`m!`",
              inline: true
            },
            {
              name: "🏠 Servidores",
              value:
                String(
                  client.guilds.cache.size
                ),
              inline: true
            },
            {
              name: "🤖 IA",
              value: "Gemini",
              inline: true
            }
          )
      ]
    });
  }

  if (command === "serverinfo") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(
            `🏠 ${message.guild.name}`
          )
          .addFields(
            {
              name: "👥 Miembros",
              value:
                String(
                  message.guild.memberCount
                ),
              inline: true
            },
            {
              name: "💬 Canales",
              value:
                String(
                  message.guild.channels.cache.size
                ),
              inline: true
            },
            {
              name: "🎭 Roles",
              value:
                String(
                  message.guild.roles.cache.size
                ),
              inline: true
            },
            {
              name: "🆔 ID",
              value: message.guild.id
            }
          )
      ]
    });
  }

  if (
    command === "userinfo" ||
    command === "userinfo2"
  ) {

    const member =
      targetMember(
        message,
        args[0]
      ) || message.member;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(
            `👤 ${member.user.username}`
          )
          .setThumbnail(
            member.user.displayAvatarURL()
          )
          .addFields(
            {
              name: "🆔 ID",
              value: member.id,
              inline: true
            },
            {
              name: "📅 Entró",
              value:
                `<t:${Math.floor(
                  member.joinedTimestamp / 1000
                )}:R>`,
              inline: true
            },
            {
              name: "🎭 Roles",
              value:
                String(
                  Math.max(
                    0,
                    member.roles.cache.size - 1
                  )
                ),
              inline: true
            }
          )
      ]
    });
  }

  if (command === "avatar") {

    const member =
      targetMember(
        message,
        args[0]
      ) || message.member;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3498db)
          .setTitle(
            `🖼️ Avatar de ${member.user.username}`
          )
          .setImage(
            member.user.displayAvatarURL({
              size: 1024
            })
          )
      ]
    });
  }

  if (command === "servericon") {

    const icon =
      message.guild.iconURL({
        size: 1024
      });

    return message.reply(
      icon || "❌ Este servidor no tiene icono."
    );
  }

  if (command === "roles") {

    const roles =
      message.guild.roles.cache
        .filter(r =>
          r.id !== message.guild.id
        )
        .map(r => r.name)
        .join(" • ");

    return message.reply(
      roles || "No hay roles."
    );
  }

  if (command === "channels") {

    const channels =
      message.guild.channels.cache
        .map(
          c =>
            `${c.isTextBased() ? "💬" : "📁"} ${c.name}`
        )
        .join("\n");

    return message.reply(
      clean(channels)
    );
  }

  if (command === "membercount")
    return message.reply(
      `👥 Miembros: **${message.guild.memberCount}**`
    );

  if (command === "channel")
    return message.reply(
      `📌 Canal: **${message.channel.name}**\n🆔 ${message.channel.id}`
    );

  if (command === "role") {

    const role =
      targetRole(
        message.guild,
        args[0]
      );

    return message.reply(
      role
        ? `🎭 **${role.name}**\n🆔 ${role.id}\n👥 ${role.members.size} miembros`
        : "❌ Rol no encontrado."
    );
  }

  if (command === "calc") {

    const expression =
      raw.replace(
        /[^0-9+\-*/().% ]/g,
        ""
      );

    if (!expression.trim()) {
      return message.reply(
        "❌ Escribe una operación."
      );
    }

    try {

      const result =
        Function(
          `"use strict";return (${expression})`
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

  if (command === "random") {

    const a =
      Number(args[0] || 1);

    const b =
      Number(args[1] || 100);

    return message.reply(
      `🎲 **${rand(
        Math.min(a, b),
        Math.max(a, b)
      )}**`
    );
  }

  if (command === "choose") {

    const options =
      raw
        .split("|")
        .map(x => x.trim())
        .filter(Boolean);

    if (!options.length) {
      return message.reply(
        "Uso: `m!choose pizza | hamburguesa`"
      );
    }

    return message.reply(
      `🎯 Elegí: **${
        options[
          rand(0, options.length - 1)
        ]
      }**`
    );
  }

  if (command === "reverse")
    return message.reply(
      raw.split("").reverse().join("")
    );

  if (command === "uppercase")
    return message.reply(
      raw.toUpperCase()
    );

  if (command === "lowercase")
    return message.reply(
      raw.toLowerCase()
    );

  if (command === "wordcount")
    return message.reply(
      `🔢 Palabras: **${
        raw.trim()
          ? raw.trim().split(/\s+/).length
          : 0
      }**`
    );

  if (command === "textstats")
    return message.reply(
      `📊 Caracteres: **${raw.length}**`
    );

  if (command === "serverid")
    return message.reply(
      `🆔 ${message.guild.id}`
    );

  if (command === "timestamp")
    return message.reply(
      `🕒 <t:${Math.floor(
        Date.now() / 1000
      )}:F>`
    );

  if (command === "permissions")
    return message.reply(
      `🔐 ${
        message.member.permissions
          .toArray()
          .join(", ") || "Ninguno"
      }`
    );

  // ========================================================
  // 💰 ECONOMÍA
  // ========================================================

  if (command === "balance")
    return message.reply(
      `💰 Efectivo: **${money(
        user.balance
      )}**\n🏦 Banco: **${money(
        user.bank
      )}**`
    );

  if (command === "bank")
    return message.reply(
      `🏦 Banco: **${money(
        user.bank
      )}**`
    );

  if (command === "economy")
    return message.reply(
      `💰 Efectivo: **${money(
        user.balance
      )}\n🏦 Banco: **${money(
        user.bank
      )}\n📈 Patrimonio: **${money(
        user.balance + user.bank
      )}**`
    );

  const earning = {
    daily: [500, 700],
    work: [100, 300],
    job: [250, 450],
    salary: [800, 1200],
    beg: [40, 90],
    fish: [80, 220],
    mine: [100, 260],
    farm: [120, 300],
    collect: [60, 140],
    quest: [200, 500],
    bonus: [150, 300],
    recycle: [40, 120]
  };

  if (earning[command]) {

    const times = {
      daily: 86400000,
      work: 30000,
      job: 60000,
      salary: 3600000,
      beg: 30000,
      fish: 45000,
      mine: 45000,
      farm: 45000,
      collect: 30000,
      quest: 120000,
      bonus: 60000,
      recycle: 30000
    };

    const left = cooldown(
      user,
      command,
      times[command] || 30000
    );

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    const amount =
      rand(
        earning[command][0],
        earning[command][1]
      );

    addMoney(user, amount);

    return message.reply(
      `💰 Ganaste **${money(amount)}**.`
    );
  }

  if (command === "deposit") {

    const amount =
      Number(args[0]);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "Uso: `m!deposit cantidad`"
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
      Number(args[0]);

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      return message.reply(
        "Uso: `m!withdraw cantidad`"
      );
    }

    if (amount > user.bank) {
      return message.reply(
        "❌ No tienes suficiente en el banco."
      );
    }

    user.bank -= amount;
    user.balance += amount;
    save();

    return message.reply(
      `💰 Retiraste **${money(amount)}**.`
    );
  }

  if (command === "pay") {

    const target =
      targetMember(
        message,
        args[0]
      );

    const amount =
      Number(args[1]);

    if (!target || !amount || amount <= 0) {
      return message.reply(
        "Uso: `m!pay @usuario cantidad`"
      );
    }

    if (amount > user.balance) {
      return message.reply(
        "❌ No tienes suficiente dinero."
      );
    }

    const receiver =
      udata(
        guildId,
        target.id
      );

    user.balance -= amount;
    receiver.balance += amount;

    save();

    return message.reply(
      `💸 Pagaste **${money(amount)}** a ${target}.`
    );
  }

  if (command === "inventory") {

    const entries =
      Object.entries(
        user.inventory
      );

    return message.reply(
      entries.length
        ? "🎒 Inventario:\n" +
          entries
            .map(
              ([item, amount]) =>
                `• ${item}: **${amount}**`
            )
            .join("\n")
        : "🎒 Tu inventario está vacío."
    );
  }

  if (command === "shop") {

    return message.reply(
      [
        "🛒 **TIENDA MADOKAMI**",
        "",
        "🍎 comida — 100 💰",
        "☕ cafe — 150 💰",
        "🐟 pescado — 250 💰",
        "⛏️ mineral — 300 💰",
        "🪵 madera — 120 💰",
        "🌱 semilla — 80 💰",
        "⚙️ hierro — 500 💰",
        "",
        "Usa `m!buy objeto`"
      ].join("\n")
    );
  }

  if (command === "buy") {

    const item =
      args[0]?.toLowerCase();

    const prices = {
      comida: 100,
      cafe: 150,
      pescado: 250,
      mineral: 300,
      madera: 120,
      semilla: 80,
      hierro: 500
    };

    if (!prices[item]) {
      return message.reply(
        "❌ Objeto no encontrado."
      );
    }

    if (user.balance < prices[item]) {
      return message.reply(
        "❌ No tienes suficiente dinero."
      );
    }

    user.balance -= prices[item];

    addItem(
      user,
      item
    );

    return message.reply(
      `🛒 Compraste **${item}** por **${money(
        prices[item]
      )}**.`
    );
  }

  if (command === "crime") {

    const left =
      cooldown(
        user,
        "crime",
        120000
      );

    if (left) {
      return message.reply(
        `⏳ Espera **${left}s**.`
      );
    }

    if (Math.random() < 0.2) {

      const amount =
        rand(500, 700);

      addMoney(user, amount);

      return message.reply(
        `🎲 Resultado ficticio: ganaste **${money(
          amount
        )}**.`
      );
    }

    const loss =
      Math.min(
        600,
        user.balance
      );

    user.balance -= loss;
    save();

    return message.reply(
      `🎲 Resultado ficticio: perdiste **${money(
        loss
      )}**.`
    );
  }

  if (command === "networth")
    return message.reply(
      `📈 Patrimonio: **${money(
        user.balance + user.bank
      )}**`
    );

  if (command === "leaderboard") {

    const ranking =
      Object.entries(
        db.users[guildId] || {}
      )
        .sort(
          (a, b) =>
            (b[1].balance + b[1].bank) -
            (a[1].balance + a[1].bank)
        )
        .slice(0, 10);

    return message.reply(
      ranking.length
        ? ranking
            .map(
              (x, i) =>
                `${i + 1}. <@${x[0]}> — ${money(
                  x[1].balance + x[1].bank
                )}`
            )
            .join("\n")
        : "Sin datos."
    );
  }

  // ========================================================
  // 🛡️ MODERACIÓN
  // ========================================================

  if (CATS.moderacion.cmds.some(
    x => x[0] === command
  )) {

    if (!manage(message)) {
      return message.reply(
        "❌ Necesitas permisos de moderación."
      );
    }

    const target =
      targetMember(
        message,
        args[0]
      );

    if (command === "ban") {

      if (!target)
        return message.reply(
          "Uso: `m!ban @usuario`"
        );

      if (!target.bannable)
        return message.reply(
          "❌ No puedo banear a ese usuario."
        );

      await target.ban({
        reason:
          args.slice(1).join(" ") ||
          "Madokami"
      });

      await log(
        message.guild,
        "🔨 Ban",
        `${message.author.tag} baneó a ${target.user.tag}.`
      );

      return message.reply(
        `🔨 **${target.user.tag}** fue baneado.`
      );
    }

    if (command === "kick") {

      if (!target)
        return message.reply(
          "Uso: `m!kick @usuario`"
        );

      if (!target.kickable)
        return message.reply(
          "❌ No puedo expulsar a ese usuario."
        );

      await target.kick(
        args.slice(1).join(" ") ||
        "Madokami"
      );

      await log(
        message.guild,
        "👢 Kick",
        `${message.author.tag} expulsó a ${target.user.tag}.`
      );

      return message.reply(
        `👢 **${target.user.tag}** fue expulsado.`
      );
    }

    if (
      command === "timeout" ||
      command === "mute"
    ) {

      if (!target)
        return message.reply(
          "Uso: `m!timeout @usuario [minutos]`"
        );

      const minutes =
        Math.min(
          40320,
          Math.max(
            1,
            Number(args[1] || 10)
          )
        );

      await target.timeout(
        minutes * 60000,
        "Madokami"
      );

      await log(
        message.guild,
        "⏳ Timeout",
        `${message.author.tag} aplicó timeout a ${target.user.tag} durante ${minutes} minutos.`
      );

      return message.reply(
        `⏳ **${target.user.tag}** recibió timeout por **${minutes} minutos**.`
      );
    }

    if (
      command === "untimeout" ||
      command === "unmute"
    ) {

      if (!target)
        return message.reply(
          "Uso: `m!unmute @usuario`"
        );

      await target.timeout(
        null,
        "Madokami"
      );

      await log(
        message.guild,
        "🔊 Unmute",
        `${message.author.tag} quitó el timeout a ${target.user.tag}.`
      );

      return message.reply(
        `🔊 Timeout quitado a **${target.user.tag}**.`
      );
    }

    if (command === "warn") {

      if (!target)
        return message.reply(
          "Uso: `m!warn @usuario razón`"
        );

      const reason =
        args.slice(1).join(" ") ||
        "Sin razón";

      const targetData =
        udata(
          guildId,
          target.id
        );

      targetData.warnings.push({
        reason,
        moderator:
          message.author.id,
        date:
          Date.now()
      });

      save();

      await log(
        message.guild,
        "⚠️ Advertencia",
        `${message.author.tag} advirtió a ${target.user.tag}.\nRazón: ${reason}`
      );

      return message.reply(
        `⚠️ **${target.user.tag}** recibió una advertencia.`
      );
    }

    if (command === "warnings") {

      if (!target)
        return message.reply(
          "Uso: `m!warnings @usuario`"
        );

      const data =
        udata(
          guildId,
          target.id
        );

      return message.reply(
        data.warnings.length
          ? data.warnings
              .map(
                (w, i) =>
                  `**${i + 1}.** ${w.reason}`
              )
              .join("\n")
          : "✅ No tiene advertencias."
      );
    }

    if (command === "unwarn") {

      if (!target)
        return message.reply(
          "Uso: `m!unwarn @usuario`"
        );

      const data =
        udata(
          guildId,
          target.id
        );

      data.warnings.pop();
      save();

      return message.reply(
        `✅ Se quitó la última advertencia de **${target.user.tag}**.`
      );
    }

    if (command === "clear") {

      const amount =
        Math.min(
          100,
          Math.max(
            1,
            Number(args[0] || 10)
          )
        );

      const deleted =
        await message.channel.bulkDelete(
          amount,
          true
        );

      await log(
        message.guild,
        "🧹 Clear",
        `${message.author.tag} eliminó ${deleted.size} mensajes.`
      );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xe74c3c)
            .setDescription(
              `🧹 Se eliminaron **${deleted.size} mensajes**.`
            )
        ]
      }).then(msg =>
        setTimeout(
          () =>
            msg.delete().catch(() => {}),
          4000
        )
      );
    }

    if (command === "slowmode") {

      const seconds =
        Math.min(
          21600,
          Math.max(
            0,
            Number(args[0] || 0)
          )
        );

      await message.channel.setRateLimitPerUser(
        seconds
      );

      await log(
        message.guild,
        "🐢 Slowmode",
        `${message.author.tag} configuró ${seconds}s.`
      );

      return message.reply(
        `🐢 Slowmode: **${seconds}s**`
      );
    }

    if (
      command === "lock" ||
      command === "unlock"
    ) {

      const locked =
        command === "lock";

      await message.channel.permissionOverwrites.edit(
        message.guild.roles.everyone,
        {
          SendMessages:
            locked ? false : null
        }
      );

      await log(
        message.guild,
        locked
          ? "🔒 Canal bloqueado"
          : "🔓 Canal desbloqueado",
        `${message.author.tag} ${command}.`
      );

      return message.reply(
        locked
          ? "🔒 Canal bloqueado."
          : "🔓 Canal desbloqueado."
      );
    }

    if (command === "nick") {

      if (!target)
        return message.reply(
          "Uso: `m!nick @usuario nuevo nombre`"
        );

      const nickname =
        args.slice(1).join(" ");

      await target.setNickname(
        nickname || null
      );

      return message.reply(
        `🏷️ Apodo actualizado para **${target.user.tag}**.`
      );
    }

    if (command === "roleadd") {

      if (!target || !args[1])
        return message.reply(
          "Uso: `m!roleadd @usuario @rol`"
        );

      const role =
        targetRole(
          message.guild,
          args[1]
        );

      if (!role)
        return message.reply(
          "❌ Rol no encontrado."
        );

      await target.roles.add(role);

      return message.reply(
        `🎭 Rol **${role.name}** añadido a ${target}.`
      );
    }

    if (command === "roleremove") {

      if (!target || !args[1])
        return message.reply(
          "Uso: `m!roleremove @usuario @rol`"
        );

      const role =
        targetRole(
          message.guild,
          args[1]
        );

      if (!role)
        return message.reply(
          "❌ Rol no encontrado."
        );

      await target.roles.remove(role);

      return message.reply(
        `🎭 Rol **${role.name}** eliminado de ${target}.`
      );
    }

    if (command === "rolecreate") {

      const name =
        raw || "Nuevo rol";

      const role =
        await message.guild.roles.create({
          name,
          reason: "Madokami"
        });

      return message.reply(
        `🎭 Rol creado: ${role}`
      );
    }

    if (command === "roledelete") {

      const role =
        targetRole(
          message.guild,
          args[0]
        );

      if (!role)
        return message.reply(
          "❌ Rol no encontrado."
        );

      await role.delete(
        "Madokami"
      );

      return message.reply(
        "🗑️ Rol eliminado."
      );
    }

    if (command === "roleinfo") {

      const role =
        targetRole(
          message.guild,
          args[0]
        );

      if (!role)
        return message.reply(
          "❌ Rol no encontrado."
        );

      return message.reply(
        `🎭 **${role.name}**\n🆔 ${role.id}\n👥 ${role.members.size}`
      );
    }

    if (command === "channelinfo") {

      return message.reply(
        `📁 **${message.channel.name}**\n🆔 ${message.channel.id}\nTipo: ${message.channel.type}`
      );
    }

    if (command === "channelcreate") {

      const name =
        args.join("-") ||
        "nuevo-canal";

      const channel =
        await message.guild.channels.create({
          name
        });

      return message.reply(
        `📁 Canal creado: ${channel}`
      );
    }

    if (command === "channeldelete") {

      await message.channel.delete(
        "Madokami"
      );

      return;
    }

    if (command === "channelrename") {

      const name =
        raw || "canal";

      await message.channel.setName(
        name
      );

      return message.reply(
        `✏️ Canal renombrado a **${name}**.`
      );
    }

    if (
      command === "purgebots" ||
      command === "purgeuser"
    ) {

      const messages =
        await message.channel.messages.fetch({
          limit: 100
        });

      let selected =
        messages.filter(
          x =>
            command === "purgebots"
              ? x.author.bot
              : target &&
                x.author.id === target.id
        );

      selected =
        selected.first(
          Math.min(
            100,
            Number(args[1] || 20)
          )
        );

      if (selected.length) {
        await message.channel.bulkDelete(
          selected,
          true
        );
      }

      return message.reply(
        `🧹 Eliminados: **${selected.length}**`
      );
    }

    if (
      command === "lockall" ||
      command === "unlockall"
    ) {

      const lock =
        command === "lockall";

      for (
        const channel of
        message.guild.channels.cache.values()
      ) {
        if (channel.isTextBased()) {
          await channel.permissionOverwrites.edit(
            message.guild.roles.everyone,
            {
              SendMessages:
                lock ? false : null
            }
          ).catch(() => {});
        }
      }

      return message.reply(
        lock
          ? "🔒 Canales bloqueados."
          : "🔓 Canales desbloqueados."
      );
    }

    if (command === "modstats") {

      return message.reply(
        `🛡️ **Moderación**\n\nWarnings registrados: **${
          Object.values(
            db.users[guildId] || {}
          ).reduce(
            (sum, x) =>
              sum + x.warnings.length,
            0
          )
        }**`
      );
    }

    if (command === "modhelp")
      return message.reply(
        "🛡️ Usa `m!help` → Moderación."
      );
  }

  // ========================================================
  // 👥 SOCIAL
  // ========================================================

  if (command === "profile") {

    return message.reply(
      `👤 **Perfil de ${message.author.username}**\n\n` +
      `💰 Dinero: ${money(user.balance)}\n` +
      `⭐ Nivel: **${user.level}**\n` +
      `✨ XP: **${user.xp}**\n` +
      `🌟 Rep: **${user.rep}**`
    );
  }

  if (command === "level")
    return message.reply(
      `⭐ Nivel: **${user.level}** · XP: **${user.xp}**`
    );

  if (command === "xp")
    return message.reply(
      `✨ XP: **${user.xp}**`
    );

  if (command === "rank")
    return message.reply(
      `🏆 Tu rango actual es **Nivel ${user.level}**.`
    );

  if (command === "rep") {

    const target =
      targetMember(
        message,
        args[0]
      );

    const targetUser =
      target
        ? udata(guildId, target.id)
        : user;

    if (
      target &&
      target.id === message.author.id
    ) {
      return message.reply(
        "❌ No puedes darte reputación a ti mismo."
      );
    }

    if (target) {
      targetUser.rep++;
      save();

      return message.reply(
        `🌟 ${target} recibió **+1 rep**.`
      );
    }

    return message.reply(
      `🌟 Tu reputación: **${user.rep}**`
    );
  }

  if (command === "bio")
    return message.reply(
      user.bio ||
      "📝 No tienes una bio."
    );

  if (command === "setbio") {

    user.bio =
      raw.slice(0, 500);

    save();

    return message.reply(
      "📝 Bio guardada."
    );
  }

  if (
    command === "afk" ||
    command === "setafk"
  ) {

    user.afk = true;
    user.afkText =
      raw || "Estoy AFK.";

    save();

    return message.reply(
      `💤 AFK activado: **${user.afkText}**`
    );
  }

  if (command === "birthday") {

    return message.reply(
      user.birthday ||
      "🎂 No tienes cumpleaños guardado."
    );
  }

  if (command === "setbirthday") {

    user.birthday =
      raw.slice(0, 50);

    save();

    return message.reply(
      "🎂 Cumpleaños guardado."
    );
  }

  if (command === "timezone")
    return message.reply(
      `🌍 Zona horaria: **${user.timezone}**`
    );

  if (command === "settimezone") {

    user.timezone =
      raw.slice(0, 50);

    save();

    return message.reply(
      "🌍 Zona horaria guardada."
    );
  }

  if (command === "note") {

    if (!raw)
      return message.reply(
        "Uso: `m!note texto`"
      );

    user.notes.push(
      raw.slice(0, 300)
    );

    save();

    return message.reply(
      "📝 Nota guardada."
    );
  }

  if (command === "notes")
    return message.reply(
      user.notes.length
        ? user.notes
            .map(
              (x, i) =>
                `${i + 1}. ${x}`
            )
            .join("\n")
        : "📝 No tienes notas."
    );

  if (command === "clearnotes") {

    user.notes = [];

    save();

    return message.reply(
      "🧹 Notas eliminadas."
    );
  }

  if (command === "rolesme") {

    return message.reply(
      message.member.roles.cache
        .filter(r =>
          r.id !== message.guild.id
        )
        .map(r => `• ${r.name}`)
        .join("\n") ||
      "Sin roles."
    );
  }

  if (command === "mydata")
    return message.reply(
      `📊 Nivel: ${user.level}\nXP: ${user.xp}\nRep: ${user.rep}\nNotas: ${user.notes.length}`
    );

  if (command === "members")
    return message.reply(
      `👥 Miembros: **${message.guild.memberCount}**`
    );

  if (command === "online") {

    const online =
      message.guild.members.cache.filter(
        x =>
          x.presence?.status &&
          x.presence.status !== "offline"
      ).size;

    return message.reply(
      `🟢 Online: **${online}**`
    );
  }

  if (command === "oldest") {

    const member =
      message.guild.members.cache
        .sort(
          (a, b) =>
            a.joinedTimestamp -
            b.joinedTimestamp
        )
        .first();

    return message.reply(
      member
        ? `👴 ${member.user.tag}`
        : "No disponible."
    );
  }

  if (command === "newest") {

    const member =
      message.guild.members.cache
        .sort(
          (a, b) =>
            b.joinedTimestamp -
            a.joinedTimestamp
        )
        .first();

    return message.reply(
      member
        ? `🆕 ${member.user.tag}`
        : "No disponible."
    );
  }

  if (command === "top") {

    const list =
      Object.entries(
        db.users[guildId] || {}
      )
        .sort(
          (a, b) =>
            b[1].xp - a[1].xp
        )
        .slice(0, 10);

    return message.reply(
      list
        .map(
          (x, i) =>
            `${i + 1}. <@${x[0]}> — ${x[1].xp} XP`
        )
        .join("\n") ||
      "Sin datos."
    );
  }

  if (command === "repboard") {

    const list =
      Object.entries(
        db.users[guildId] || {}
      )
        .sort(
          (a, b) =>
            b[1].rep - a[1].rep
        )
        .slice(0, 10);

    return message.reply(
      list
        .map(
          (x, i) =>
            `${i + 1}. <@${x[0]}> — ${x[1].rep} rep`
        )
        .join("\n") ||
      "Sin datos."
    );
  }

  if (command === "social")
    return message.reply(
      "👥 Perfil social guardado en Madokami."
    );

  if (command === "socialhelp")
    return message.reply(
      "👥 Usa `m!help` → Social."
    );

  // ========================================================
  // 🎮 DIVERSIÓN
  // ========================================================

  if (command === "8ball") {

    const answers = [
      "Sí.",
      "No.",
      "Probablemente.",
      "Definitivamente.",
      "No estoy seguro.",
      "Pregunta otra vez."
    ];

    return message.reply(
      `🎱 ${answers[
        rand(0, answers.length - 1)
      ]}`
    );
  }

  if (command === "coinflip")
    return message.reply(
      Math.random() < 0.5
        ? "🪙 Cara"
        : "🪙 Cruz"
    );

  if (command === "dice")
    return message.reply(
      `🎲 ${rand(1, 6)}`
    );

  if (command === "roll") {

    const input =
      args[0] || "1d6";

    const parts =
      input
        .toLowerCase()
        .split("d")
        .map(Number);

    const count =
      Math.min(
        20,
        Math.max(1, parts[0] || 1)
      );

    const sides =
      Math.max(
        2,
        parts[1] || 6
      );

    let total = 0;

    for (
      let i = 0;
      i < count;
      i++
    ) {
      total += rand(1, sides);
    }

    return message.reply(
      `🎲 Resultado: **${total}**`
    );
  }

  if (command === "rps") {

    const choices = [
      "✊ Piedra",
      "📄 Papel",
      "✂️ Tijera"
    ];

    return message.reply(
      `🎮 Yo elijo **${
        choices[
          rand(0, 2)
        ]
      }**`
    );
  }

  if (
    command === "joke" ||
    command === "dadjoke" ||
    command === "pun"
  ) {

    const jokes = [
      "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "😂 Mi código funciona... no preguntes por qué.",
      "😂 El servidor pidió espacio porque estaba lleno."
    ];

    return message.reply(
      jokes[
        rand(0, jokes.length - 1)
      ]
    );
  }

  if (command === "compliment")
    return message.reply(
      "🌟 ¡Tienes buena creatividad!"
    );

  if (command === "roast")
    return message.reply(
      "🔥 Broma ligera: hasta el Wi-Fi te pide paciencia."
    );

  if (command === "fact")
    return message.reply(
      "🧠 Dato: los pulpos tienen tres corazones."
    );

  if (command === "fortune")
    return message.reply(
      "🔮 Hoy podrías descubrir algo interesante."
    );

  if (command === "emojify")
    return message.reply(
      raw
        .replace(/a/gi, "🅰️")
        .replace(/b/gi, "🅱️")
        .replace(/o/gi, "⭕")
    );

  if (
    command === "scramble" ||
    command === "anagram"
  ) {

    const word =
      raw || "madokami";

    return message.reply(
      word
        .split("")
        .sort(
          () => Math.random() - 0.5
        )
        .join("")
    );
  }

  if (command === "mock")
    return message.reply(
      [...raw]
        .map(
          (c, i) =>
            i % 2
              ? c.toUpperCase()
              : c.toLowerCase()
        )
        .join("")
    );

  if (command === "wyr")
    return message.reply(
      "🤔 ¿Qué prefieres: pausar el tiempo o rebobinar 10 segundos?"
    );

  if (command === "riddle")
    return message.reply(
      "🧩 Cuanto más quitas, más grande se vuelve. ¿Qué es? Un agujero."
    );

  if (command === "quote")
    return message.reply(
      "💬 La constancia convierte pequeños pasos en grandes avances."
    );

  if (command === "binary")
    return message.reply(
      raw
        .split("")
        .map(
          c =>
            c.charCodeAt(0).toString(2)
        )
        .join(" ")
    );

  if (command === "vowels")
    return message.reply(
      `🔤 Vocales: **${
        [...raw.toLowerCase()]
          .filter(c =>
            "aeiouáéíóú".includes(c)
          ).length
      }**`
    );

  if (command === "count") {

    const n =
      Math.min(
        100,
        Math.max(
          1,
          Number(args[0] || 10)
        )
      );

    return message.reply(
      Array.from(
        { length: n },
        (_, i) => i + 1
      ).join(" ")
    );
  }

  if (command === "echo")
    return message.reply(
      raw || "..."
    );

  if (command === "color")
    return message.reply(
      `🎨 #${Math.floor(
        Math.random() * 16777215
      )
        .toString(16)
        .padStart(6, "0")}`
    );

  if (command === "mathgame") {

    const a = rand(1, 20);
    const b = rand(1, 20);

    return message.reply(
      `🧮 ¿Cuánto es **${a} + ${b}**?`
    );
  }

  if (command === "trivia") {

    return message.reply(
      [
        "🧠 **TRIVIA**",
        "",
        "¿Cuál es el planeta más grande?",
        "",
        "A) Marte",
        "B) Júpiter",
        "C) Venus",
        "D) Mercurio",
        "",
        "✅ Respuesta: B"
      ].join("\n")
    );
  }

  if (command === "funhelp")
    return message.reply(
      "🎮 Usa `m!help` → Diversión."
    );

  // ========================================================
  // 👑 ADMINISTRACIÓN
  // ========================================================

  if (CATS.admin.cmds.some(
    x => x[0] === command
  )) {

    if (command === "setup") {
      gdata(guildId);
      save();

      return message.reply(
        "✅ Configuración inicial guardada."
      );
    }

    if (command === "log") {

      const channel =
        message.mentions.channels.first() ||
        message.guild.channels.cache.get(
          args[0]?.replace(/[<#>]/g, "")
        );

      if (!channel) {

        guildData.logChannel = null;
        save();

        return message.reply(
          "📋 Logs desactivados."
        );
      }

      guildData.logChannel =
        channel.id;

      save();

      await log(
        message.guild,
        "📋 Logs activados",
        `${message.author.tag} configuró ${channel}.`
      );

      return message.reply(
        `📋 Logs configurados en ${channel}.`
      );
    }

    if (command === "antilink") {

      const mode =
        (args[0] || "toggle")
          .toLowerCase();

      if (
        ["on","true","1"]
          .includes(mode)
      ) {
        guildData.antiLink = true;
      } else if (
        ["off","false","0"]
          .includes(mode)
      ) {
        guildData.antiLink = false;
      } else {
        guildData.antiLink =
          !guildData.antiLink;
      }

      save();

      await log(
        message.guild,
        "🔗 Anti-link",
        `Estado: ${guildData.antiLink ? "ON" : "OFF"}`
      );

      return message.reply(
        `🔗 Anti-link: **${
          guildData.antiLink
            ? "ON"
            : "OFF"
        }**`
      );
    }

    if (command === "antispam") {

      const mode =
        (args[0] || "toggle")
          .toLowerCase();

      if (
        ["on","true","1"]
          .includes(mode)
      ) {
        guildData.antiSpam = true;
      } else if (
        ["off","false","0"]
          .includes(mode)
      ) {
        guildData.antiSpam = false;
      } else {
        guildData.antiSpam =
          !guildData.antiSpam;
      }

      save();

      await log(
        message.guild,
        "🚨 Anti-spam",
        `Estado: ${guildData.antiSpam ? "ON" : "OFF"}`
      );

      return message.reply(
        `🚨 Anti-spam: **${
          guildData.antiSpam
            ? "ON"
            : "OFF"
        }**`
      );
    }

    if (command === "whitelist") {

      const sub =
        args[0]?.toLowerCase();

      if (sub === "list") {

        return message.reply(
          guildData.whitelist.length
            ? guildData.whitelist
                .map(
                  id => `• <@${id}>`
                )
                .join("\n")
            : "🛡️ Whitelist vacía."
        );
      }

      const target =
        targetMember(
          message,
          args[1]
        );

      if (
        !target ||
        !["add","remove"].includes(sub)
      ) {
        return message.reply(
          "Uso: `m!whitelist add @usuario`, `remove @usuario` o `list`."
        );
      }

      if (sub === "add") {

        if (
          !guildData.whitelist.includes(
            target.id
          )
        ) {
          guildData.whitelist.push(
            target.id
          );
        }

        save();

        return message.reply(
          `🛡️ ${target.user.tag} añadido a la whitelist.`
        );
      }

      guildData.whitelist =
        guildData.whitelist.filter(
          id => id !== target.id
        );

      save();

      return message.reply(
        `🛡️ ${target.user.tag} eliminado de la whitelist.`
      );
    }

    if (command === "say") {

      if (!raw)
        return message.reply(
          "Escribe un mensaje."
        );

      await message.delete()
        .catch(() => {});

      return message.channel.send({
        content: raw,
        allowedMentions: {
          parse: []
        }
      });
    }

    if (command === "announce") {

      if (!raw)
        return message.reply(
          "Escribe el anuncio."
        );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff69b4)
            .setTitle("📢 ANUNCIO")
            .setDescription(
              clean(raw, 3900)
            )
            .setTimestamp()
        ]
      });
    }

    if (
      command === "autoreplyadd"
    ) {

      const [
        trigger,
        response
      ] = raw
        .split("|")
        .map(x => x?.trim());

      if (!trigger || !response) {
        return message.reply(
          "Uso: `m!autoreplyadd palabra | respuesta`"
        );
      }

      guildData.autoReplies.push({
        trigger:
          trigger.toLowerCase(),
        response
      });

      save();

      return message.reply(
        "✅ Autorespuesta añadida."
      );
    }

    if (
      command === "autoreplylist"
    ) {

      return message.reply(
        guildData.autoReplies.length
          ? guildData.autoReplies
              .map(
                (x, i) =>
                  `${i + 1}. ${x.trigger} → ${x.response}`
              )
              .join("\n")
          : "Vacío."
      );
    }

    if (
      command === "autoreplyclear"
    ) {

      guildData.autoReplies = [];
      save();

      return message.reply(
        "🧹 Autorespuestas borradas."
      );
    }

    if (
      command === "autoreplydel"
    ) {

      const index =
        Number(args[0]) - 1;

      if (
        !guildData.autoReplies[index]
      ) {
        return message.reply(
          "❌ Índice inválido."
        );
      }

      guildData.autoReplies.splice(
        index,
        1
      );

      save();

      return message.reply(
        "🗑️ Autorespuesta eliminada."
      );
    }

    if (
      command === "autoreactadd"
    ) {

      const [
        trigger,
        emoji
      ] = raw
        .split("|")
        .map(x => x?.trim());

      if (!trigger || !emoji) {
        return message.reply(
          "Uso: `m!autoreactadd palabra | emoji`"
        );
      }

      guildData.autoReacts.push({
        trigger:
          trigger.toLowerCase(),
        emoji
      });

      save();

      return message.reply(
        "✅ Reacción automática añadida."
      );
    }

    if (
      command === "autoreactlist"
    ) {

      return message.reply(
        guildData.autoReacts.length
          ? guildData.autoReacts
              .map(
                (x, i) =>
                  `${i + 1}. ${x.trigger} → ${x.emoji}`
              )
              .join("\n")
          : "Vacío."
      );
    }

    if (
      command === "autoreactclear"
    ) {

      guildData.autoReacts = [];
      save();

      return message.reply(
        "🧹 Reacciones borradas."
      );
    }

    if (
      command === "autoreactdel"
    ) {

      const index =
        Number(args[0]) - 1;

      if (
        !guildData.autoReacts[index]
      ) {
        return message.reply(
          "❌ Índice inválido."
        );
      }

      guildData.autoReacts.splice(
        index,
        1
      );

      save();

      return message.reply(
        "🗑️ Reacción eliminada."
      );
    }

    if (
      command === "welcome" ||
      command === "goodbye"
    ) {

      const key =
        command === "welcome"
          ? "welcome"
          : "goodbye";

      const mode =
        args[0]?.toLowerCase();

      if (
        ["on","true","1"]
          .includes(mode)
      ) {
        guildData[key].enabled = true;
      } else if (
        ["off","false","0"]
          .includes(mode)
      ) {
        guildData[key].enabled = false;
      } else {
        guildData[key].enabled =
          !guildData[key].enabled;
      }

      save();

      return message.reply(
        `✅ ${key}: **${
          guildData[key].enabled
            ? "ON"
            : "OFF"
        }**`
      );
    }

    if (
      command === "welcomechannel" ||
      command === "goodbyechannel"
    ) {

      const key =
        command === "welcomechannel"
          ? "welcome"
          : "goodbye";

      const channel =
        message.mentions.channels.first();

      if (!channel)
        return message.reply(
          "❌ Menciona un canal."
        );

      guildData[key].channel =
        channel.id;

      save();

      return message.reply(
        `✅ Canal de ${key} guardado.`
      );
    }

    if (
      command === "welcomemessage" ||
      command === "goodbyemessage"
    ) {

      const key =
        command === "welcomemessage"
          ? "welcome"
          : "goodbye";

      guildData[key].text =
        raw.slice(0, 1000);

      save();

      return message.reply(
        "✅ Mensaje guardado.\nVariables: `{user}` `{server}` `{count}`"
      );
    }

    if (command === "autorole") {

      const role =
        targetRole(
          message.guild,
          args.join(" ")
        );

      if (!role) {

        guildData.autorole = null;
        save();

        return message.reply(
          "👥 Autorole desactivado."
        );
      }

      guildData.autorole =
        role.id;

      save();

      return message.reply(
        `👥 Autorole: ${role}`
      );
    }

    if (command === "reactionroleadd") {

      const messageId =
        args[0];

      const emoji =
        args[1];

      const role =
        targetRole(
          message.guild,
          args[2]
        );

      if (
        !messageId ||
        !emoji ||
        !role
      ) {
        return message.reply(
          "Uso: `m!reactionroleadd ID emoji @rol`"
        );
      }

      guildData.reactionRoles[
        `${messageId}:${emoji}`
      ] = role.id;

      save();

      return message.reply(
        "✅ Reaction-role guardado."
      );
    }

    if (
      command === "reactionrolelist"
    ) {

      return message.reply(
        Object.entries(
          guildData.reactionRoles
        )
          .map(
            ([key, role]) =>
              `${key} → <@&${role}>`
          )
          .join("\n") ||
        "Vacío."
      );
    }

    if (
      command === "reactionroledel"
    ) {

      const key =
        args.join(":");

      if (
        !guildData.reactionRoles[key]
      ) {
        return message.reply(
          "❌ No encontrado."
        );
      }

      delete guildData.reactionRoles[key];

      save();

      return message.reply(
        "🗑️ Reaction-role eliminado."
      );
    }

    if (command === "config") {

      return message.reply(
        [
          "⚙️ **CONFIGURACIÓN**",
          "",
          `🔗 Anti-link: ${guildData.antiLink ? "ON" : "OFF"}`,
          `🚨 Anti-spam: ${guildData.antiSpam ? "ON" : "OFF"}`,
          `🛡️ Whitelist: ${guildData.whitelist.length}`,
          `📋 Logs: ${guildData.logChannel ? "ON" : "OFF"}`,
          `🌸 Welcome: ${guildData.welcome.enabled ? "ON" : "OFF"}`,
          `👋 Goodbye: ${guildData.goodbye.enabled ? "ON" : "OFF"}`,
          `👥 Autorole: ${guildData.autorole ? "ON" : "OFF"}`
        ].join("\n")
      );
    }

    if (command === "resetconfig") {

      delete db.guilds[guildId];

      gdata(guildId);

      save();

      return message.reply(
        "♻️ Configuración restablecida."
      );
    }

    if (command === "status") {

      const status =
        raw || "m!help";

      guildData.botStatus =
        status;

      client.user.setActivity(
        status
      );

      save();

      return message.reply(
        "✅ Estado actualizado."
      );
    }

    if (command === "helpad") {

      return message.reply(
        [
          "👑 **PANEL DE ADMINISTRACIÓN**",
          "",
          "`m!setup`",
          "`m!log #canal`",
          "`m!antilink on/off`",
          "`m!antispam on/off`",
          "`m!whitelist add/remove @usuario`",
          "`m!say mensaje`",
          "`m!announce mensaje`",
          "`m!autoreplyadd palabra | respuesta`",
          "`m!autoreactadd palabra | emoji`",
          "`m!welcome on/off`",
          "`m!goodbye on/off`",
          "`m!autorole @rol`",
          "`m!config`",
          "`m!resetconfig`",
          "`m!status texto`"
        ].join("\n")
      );
    }
  }

  // ========================================================
  // 🤖 IA
  // ========================================================

  if (CATS.ia.cmds.some(
    x => x[0] === command
  )) {

    if (command === "imagen") {

      if (!raw)
        return message.reply(
          "Uso: `m!imagen descripción`"
        );

      try {

        const buffer =
          await makeImage(raw);

        return message.reply({
          content:
            "🎨 Imagen generada por Gemini.",
          files: [
            new AttachmentBuilder(
              buffer,
              {
                name:
                  "madokami.png"
              }
            )
          ]
        });

      } catch (err) {

        console.error(
          "Gemini image:",
          err
        );

        return message.reply(
          "❌ Gemini no pudo generar la imagen. Revisa GEMINI_API_KEY y el modelo de imagen."
        );
      }
    }

    if (!raw) {
      return message.reply(
        `Uso: \`m!${command} tu pregunta\``
      );
    }

    const prompt = [
      "Eres Madokami, un asistente de Discord.",
      "Responde en español.",
      `Tarea: ${command}`,
      `Solicitud: ${raw}`
    ].join("\n");

    try {

      const answer =
        await askAI(prompt);

      return message.reply(
        clean(answer, 1900)
      );

    } catch (err) {

      console.error(
        "Gemini:",
        err.message
      );

      return message.reply(
        "❌ No pude usar Gemini. Comprueba `GEMINI_API_KEY` y el modelo configurado."
      );
    }
  }

  return message.reply(
    "❌ Comando no encontrado. Usa `m!help`."
  );
}

// ============================================================
// 🚨 ANTI-SPAM / ANTI-LINK / XP
// ============================================================

const spam = new Map();

client.on(
  "messageCreate",
  async message => {

    if (
      !message.guild ||
      message.author.bot
    ) {
      return;
    }

    const guildData =
      gdata(
        message.guild.id
      );

    const user =
      udata(
        message.guild.id,
        message.author.id
      );

    // Anti-spam
    if (
      !message.content.startsWith(PREFIX) &&
      !admin(message) &&
      !isWhite(
        message.guild.id,
        message.author.id
      )
    ) {

      const key =
        `${message.guild.id}:${message.author.id}`;

      const now =
        Date.now();

      const messages =
        (
          spam.get(key) || []
        ).filter(
          t => now - t < 7000
        );

      messages.push(now);

      spam.set(
        key,
        messages
      );

      if (
        guildData.antiSpam &&
        messages.length > 5
      ) {

        spam.set(key, []);

        await message.delete()
          .catch(() => {});

        const warning =
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle(
                  "🚨 ANTI-SPAM"
                )
                .setDescription(
                  `<@${message.author.id}> detente. Has enviado demasiados mensajes.`
                )
                .setFooter({
                  text:
                    "Madokami Security"
                })
            ]
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

        await log(
          message.guild,
          "🚨 Anti-spam activado",
          `Usuario: ${message.author.tag}\nAcción: mensaje eliminado.`
        );

        return;
      }

      // Anti-link
      if (
        guildData.antiLink &&
        /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(
          message.content
        )
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
            embeds: [
              new EmbedBuilder()
                .setColor(0xe74c3c)
                .setTitle(
                  "🔗 ANTI-LINK"
                )
                .setDescription(
                  `<@${message.author.id}> no puede enviar enlaces aquí.\n\n` +
                  `🗑️ Mensaje eliminado.\n` +
                  `${timed ? "⏳ Timeout: 2 horas." : ""}`
                )
                .setFooter({
                  text:
                    "Madokami Security"
                })
            ]
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

        await log(
          message.guild,
          "🔗 Anti-link activado",
          `Usuario: ${message.author.tag}\nAcción: mensaje eliminado${timed ? " + timeout 2 horas." : "."}`
        );

        return;
      }

      // XP
      if (Math.random() < 0.08) {

        user.xp += 5;

        const required =
          user.level * 100;

        if (user.xp >= required) {

          user.xp -= required;
          user.level++;

          const levelMessage =
            await message.channel.send(
              `⭐ <@${message.author.id}> subió al nivel **${user.level}**.`
            ).catch(() => null);

          if (levelMessage) {
            setTimeout(
              () =>
                levelMessage.delete()
                  .catch(() => {}),
              5000
            );
          }
        }

        save();
      }

      // Autorespuestas
      for (
        const response
        of guildData.autoReplies
      ) {

        if (
          message.content
            .toLowerCase()
            .includes(
              response.trigger
            )
        ) {

          await message.channel.send(
            response.response
          ).catch(() => {});

          break;
        }
      }

      // Reacciones automáticas
      for (
        const reaction
        of guildData.autoReacts
      ) {

        if (
          message.content
            .toLowerCase()
            .includes(
              reaction.trigger
            )
        ) {

          await message.react(
            reaction.emoji
          ).catch(() => {});
        }
      }
    }

    if (
      !message.content.startsWith(
        PREFIX
      )
    ) {
      return;
    }

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
      body
        .slice(command.length)
        .trim();

    if (!COMMANDS.has(command)) {

      return message.reply(
        "❌ Comando no encontrado. Usa `m!help`."
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
        "❌ Ocurrió un error ejecutando este comando."
      ).catch(() => {});
    }
  }
);

// ============================================================
// 🌸 MENÚ HELP
// ============================================================

client.on(
  "interactionCreate",
  async interaction => {

    if (
      !interaction.isStringSelectMenu() ||
      interaction.customId !==
        "madokami_help"
    ) {
      return;
    }

    const category =
      interaction.values[0];

    await interaction.update({
      embeds: [
        helpEmbed(category)
      ],
      components: [
        helpRow()
      ]
    });
  }
);

// ============================================================
// 📋 EVENTOS DE LOGS
// ============================================================

client.on(
  "messageDelete",
  message => {

    if (
      message.guild &&
      !message.author?.bot
    ) {

      log(
        message.guild,
        "🗑️ Mensaje eliminado",
        `Autor: ${
          message.author?.tag ||
          "Desconocido"
        }\nCanal: ${
          message.channel?.name ||
          "Desconocido"
        }`
      );
    }
  }
);

client.on(
  "messageUpdate",
  (oldMessage, newMessage) => {

    if (
      newMessage.guild &&
      !newMessage.author?.bot &&
      oldMessage.content !==
        newMessage.content
    ) {

      log(
        newMessage.guild,
        "✏️ Mensaje editado",
        `Autor: ${newMessage.author?.tag}\n` +
        `Antes: ${oldMessage.content || "[sin caché]"}\n` +
        `Después: ${newMessage.content || "[sin caché]"}`
      );
    }
  }
);

// ============================================================
// 👋 BIENVENIDAS / DESPEDIDAS
// ============================================================

client.on(
  "guildMemberAdd",
  async member => {

    const data =
      gdata(member.guild.id);

    if (data.autorole) {

      const role =
        member.guild.roles.cache.get(
          data.autorole
        );

      if (role) {
        await member.roles.add(
          role
        ).catch(() => {});
      }
    }

    if (
      data.welcome.enabled &&
      data.welcome.channel
    ) {

      const channel =
        member.guild.channels.cache.get(
          data.welcome.channel
        );

      if (channel?.isTextBased()) {

        await channel.send(
          data.welcome.text
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
            )
        ).catch(() => {});
      }
    }

    await log(
      member.guild,
      "👋 Miembro entró",
      member.user.tag
    );
  }
);

client.on(
  "guildMemberRemove",
  async member => {

    const data =
      gdata(member.guild.id);

    if (
      data.goodbye.enabled &&
      data.goodbye.channel
    ) {

      const channel =
        member.guild.channels.cache.get(
          data.goodbye.channel
        );

      if (channel?.isTextBased()) {

        await channel.send(
          data.goodbye.text
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
            )
        ).catch(() => {});
      }
    }

    await log(
      member.guild,
      "👋 Miembro salió",
      member.user?.tag ||
        member.id
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

    const data =
      gdata(
        reaction.message.guild.id
      );

    const key =
      `${reaction.message.id}:${
        reaction.emoji.name ||
        reaction.emoji.toString()
      }`;

    const roleId =
      data.reactionRoles[key];

    if (!roleId) return;

    const member =
      await reaction.message.guild
        .members.fetch(user.id)
        .catch(() => null);

    if (member) {
      await member.roles.add(
        roleId
      ).catch(() => {});
    }
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

    const data =
      gdata(
        reaction.message.guild.id
      );

    const key =
      `${reaction.message.id}:${
        reaction.emoji.name ||
        reaction.emoji.toString()
      }`;

    const roleId =
      data.reactionRoles[key];

    if (!roleId) return;

    const member =
      await reaction.message.guild
        .members.fetch(user.id)
        .catch(() => null);

    if (member) {
      await member.roles.remove(
        roleId
      ).catch(() => {});
    }
  }
);

// ============================================================
// 🛡️ MÁS LOGS
// ============================================================

client.on(
  "roleCreate",
  role =>
    log(
      role.guild,
      "🎭 Rol creado",
      `Rol: **${role.name}**\nID: ${role.id}`
    )
);

client.on(
  "roleDelete",
  role =>
    log(
      role.guild,
      "🗑️ Rol eliminado",
      `Rol: **${role.name}**\nID: ${role.id}`
    )
);

client.on(
  "roleUpdate",
  (oldRole, newRole) => {

    if (
      oldRole.name !==
        newRole.name ||
      oldRole.hexColor !==
        newRole.hexColor
    ) {

      log(
        newRole.guild,
        "🎨 Rol actualizado",
        `Antes: ${oldRole.name}\nDespués: ${newRole.name}`
      );
    }
  }
);

client.on(
  "channelCreate",
  channel =>
    log(
      channel.guild,
      "📁 Canal creado",
      `Canal: ${channel.name}\nID: ${channel.id}`
    )
);

client.on(
  "channelDelete",
  channel =>
    log(
      channel.guild,
      "🗑️ Canal eliminado",
      `Canal: ${channel.name}\nID: ${channel.id}`
    )
);

client.on(
  "channelUpdate",
  (oldChannel, newChannel) => {

    if (
      oldChannel.name !==
        newChannel.name
    ) {

      log(
        newChannel.guild,
        "✏️ Canal actualizado",
        `Antes: ${oldChannel.name}\nDespués: ${newChannel.name}`
      );
    }
  }
);

client.on(
  "guildUpdate",
  (oldGuild, newGuild) => {

    if (
      oldGuild.name !==
        newGuild.name
    ) {

      log(
        newGuild,
        "🏠 Servidor actualizado",
        `Antes: ${oldGuild.name}\nDespués: ${newGuild.name}`
      );
    }
  }
);

client.on(
  "guildMemberUpdate",
  (oldMember, newMember) => {

    if (
      oldMember.nickname !==
      newMember.nickname
    ) {

      log(
        newMember.guild,
        "🏷️ Apodo actualizado",
        `${newMember.user.tag}\nAntes: ${
          oldMember.nickname ||
          "ninguno"
        }\nDespués: ${
          newMember.nickname ||
          "ninguno"
        }`
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
      [...newRoles].filter(
        id =>
          !oldRoles.has(id) &&
          id !== newMember.guild.id
      );

    const removed =
      [...oldRoles].filter(
        id =>
          !newRoles.has(id) &&
          id !== newMember.guild.id
      );

    if (
      added.length ||
      removed.length
    ) {

      log(
        newMember.guild,
        "🎭 Roles actualizados",
        `${newMember.user.tag}\n` +
        `Añadidos: ${
          added
            .map(id => `<@&${id}>`)
            .join(", ") ||
          "ninguno"
        }\n` +
        `Quitados: ${
          removed
            .map(id => `<@&${id}>`)
            .join(", ") ||
          "ninguno"
        }`
      );
    }
  }
);

client.on(
  "guildBanAdd",
  ban =>
    log(
      ban.guild,
      "🔨 Usuario baneado",
      `${ban.user.tag} (${ban.user.id})`
    )
);

client.on(
  "guildBanRemove",
  ban =>
    log(
      ban.guild,
      "🔓 Usuario desbaneado",
      `${ban.user.tag} (${ban.user.id})`
    )
);

// ============================================================
// 🌸 READY
// ============================================================

client.once(
  "ready",
  () => {

    console.log(
      `🌸 Madokami conectado como ${client.user.tag}`
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
);
