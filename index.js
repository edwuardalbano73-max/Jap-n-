// ============================================================
// 🌸 MADOKAMI
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
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

const PREFIX = "m!";
const PORT = process.env.PORT || 10000;
const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, "madokami-data.json");

// ============================================================
// CLIENT
// ============================================================

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ============================================================
// DATA
// ============================================================

let data = {};

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("❌ Error guardando datos:", err);
  }
}

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    } else {
      data = {};
      saveData();
    }
  } catch (err) {
    console.error("❌ Error cargando datos:", err);
    data = {};
  }
}

function getGuild(guildId) {
  if (!data[guildId]) {
    data[guildId] = {
      antiLink: false,
      logChannel: null,
      users: {},
      reminders: []
    };
  }

  return data[guildId];
}

function getUser(guildId, userId) {
  const guild = getGuild(guildId);

  if (!guild.users[userId]) {
    guild.users[userId] = {
      wallet: 0,
      xp: 0,
      level: 1,
      warnings: []
    };
  }

  return guild.users[userId];
}

// ============================================================
// UTILIDADES
// ============================================================

function money(n) {
  return `${n.toLocaleString("es-ES")} pesos`;
}

function random(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function admin(message) {
  return message.member?.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function embed(title, description, color = 0xff8fc7) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setFooter({
      text: "🌸 Madokami • m!"
    })
    .setTimestamp();
}

async function log(guild, title, description, color = 0xff5555) {
  const g = getGuild(guild.id);

  if (!g.logChannel) return;

  const channel = guild.channels.cache.get(g.logChannel);

  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send({
      embeds: [embed(title, description, color)]
    });
  } catch {}
}

// ============================================================
// COOLDOWNS
// ============================================================

const cooldowns = new Map();

function cooldown(userId, command, seconds) {
  const key = `${userId}-${command}`;
  const now = Date.now();

  if (cooldowns.has(key)) {
    const end = cooldowns.get(key);

    if (now < end) {
      return Math.ceil((end - now) / 1000);
    }
  }

  cooldowns.set(key, now + seconds * 1000);
  return 0;
}

// ============================================================
// XP
// ============================================================

function addXP(guildId, userId, amount = 10) {
  const user = getUser(guildId, userId);

  user.xp += amount;

  const required = user.level * 100;

  if (user.xp >= required) {
    user.xp -= required;
    user.level++;

    saveData();

    return true;
  }

  saveData();
  return false;
}

// ============================================================
// HELP
// ============================================================

function helpMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("madokami_help")
      .setPlaceholder("🌸 Selecciona una categoría")
      .addOptions([
        {
          label: "Economía",
          description: "Dinero, trabajos y actividades",
          value: "economia",
          emoji: "💰"
        },
        {
          label: "Información",
          description: "Información del servidor y usuarios",
          value: "info",
          emoji: "ℹ️"
        },
        {
          label: "Diversión",
          description: "Juegos y entretenimiento",
          value: "diversion",
          emoji: "🎮"
        },
        {
          label: "Social",
          description: "Comandos sociales",
          value: "social",
          emoji: "🤝"
        },
        {
          label: "Niveles",
          description: "XP y clasificación",
          value: "niveles",
          emoji: "📊"
        },
        {
          label: "Utilidades",
          description: "Herramientas útiles",
          value: "utilidades",
          emoji: "🛠️"
        },
        {
          label: "Madokami",
          description: "Información del bot",
          value: "madokami",
          emoji: "🌸"
        }
      ])
  );
}

function mainHelp() {
  return embed(
    "╭━━ 🌸 MADOKAMI ━━╮",
    [
      "✨ **CENTRO DE COMANDOS**",
      "",
      "Bienvenido al centro de ayuda de **Madokami**.",
      "Selecciona una categoría en el menú de abajo.",
      "",
      "💰 **Economía**",
      "Dinero, trabajos y actividades.",
      "",
      "ℹ️ **Información**",
      "Datos del servidor y usuarios.",
      "",
      "🎮 **Diversión**",
      "Juegos y entretenimiento.",
      "",
      "🤝 **Social**",
      "Interacciones sociales.",
      "",
      "📊 **Niveles**",
      "XP y clasificación.",
      "",
      "🛠️ **Utilidades**",
      "Herramientas útiles.",
      "",
      "🌸 **Madokami**",
      "Información del bot.",
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      "`m!` • Prefix de Madokami",
      "━━━━━━━━━━━━━━━━━━━━"
    ].join("\n")
  );
}

function categoryHelp(category) {
  const lists = {
    economia: [
      "💰 **ECONOMÍA**",
      "",
      "`m!balance` → Ver tu dinero.",
      "`m!work` → Trabajar y ganar 100–300 pesos.",
      "`m!risk` → Actividad de riesgo.",
      "`m!crime` → Intentar ganar 500–700 pesos.",
      "`m!pay @usuario cantidad` → Enviar dinero."
    ],

    info: [
      "ℹ️ **INFORMACIÓN**",
      "",
      "`m!userinfo` → Información de usuario.",
      "`m!serverinfo` → Información del servidor.",
      "`m!avatar` → Ver avatar.",
      "`m!botinfo` → Información de Madokami.",
      "`m!ping` → Ver latencia."
    ],

    diversion: [
      "🎮 **DIVERSIÓN**",
      "",
      "`m!8ball pregunta` → Pregunta a la bola mágica.",
      "`m!coinflip` → Cara o cruz.",
      "`m!dice` → Tirar un dado.",
      "`m!joke` → Broma aleatoria."
    ],

    social: [
      "🤝 **SOCIAL**",
      "",
      "`m!profile` → Ver perfil.",
      "`m!hug @usuario` → Dar un abrazo.",
      "`m!pat @usuario` → Dar palmaditas."
    ],

    niveles: [
      "📊 **NIVELES**",
      "",
      "`m!rank` → Ver tu nivel.",
      "`m!level` → Ver XP y nivel.",
      "`m!levels` → Clasificación del servidor."
    ],

    utilidades: [
      "🛠️ **UTILIDADES**",
      "",
      "`m!poll pregunta` → Crear encuesta.",
      "`m!remind segundos mensaje` → Crear recordatorio."
    ],

    madokami: [
      "🌸 **MADOKAMI**",
      "",
      "`m!help` → Abrir ayuda.",
      "`m!helpad` → Panel administrativo.",
      "`m!prefix` → Ver prefix.",
      "`m!about` → Información.",
      "`m!invite` → Información de invitación."
    ]
  };

  return embed(
    `╭━━ ${category.toUpperCase()} ━━╮`,
    lists[category].join("\n")
  );
}

// ============================================================
// ADMIN HELP
// ============================================================

function adminHelp() {
  return new EmbedBuilder()
    .setTitle("╭━━ 👑 MADOKAMI ADMIN ━━╮")
    .setDescription(
      [
        "🔒 **PANEL EXCLUSIVO PARA ADMINISTRADORES**",
        "",
        "🛡️ **Moderación**",
        "`m!ban` • `m!unban` • `m!kick`",
        "`m!mute` • `m!unmute` • `m!warn`",
        "`m!warnings` • `m!clear`",
        "",
        "🔐 **Seguridad**",
        "`m!antilink on/off`",
        "",
        "📋 **Logs**",
        "`m!log #canal`",
        "`m!log off`",
        "",
        "⚙️ **Configuración**",
        "`m!slowmode segundos`",
        "`m!lock`",
        "`m!unlock`",
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        "👑 Solo administradores"
      ].join("\n")
    )
    .setColor(0xff5555)
    .setFooter({ text: "🌸 Madokami Administration" });
}

// ============================================================
// READY
// ============================================================

client.once(Events.ClientReady, () => {
  console.log("======================================");
  console.log("🌸 MADOKAMI ESTÁ CONECTADO");
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
  console.log("⌨️ Prefix: m!");
  console.log("======================================");

  client.user.setActivity("m!help | 🌸 Madokami");
});

// ============================================================
// INTERACCIONES
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId !== "madokami_help") return;

  const category = interaction.values[0];

  await interaction.update({
    embeds: [categoryHelp(category)],
    components: [helpMenu()]
  });
});

// ============================================================
// MESSAGE CREATE
// ============================================================

client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  if (!message.guild) return;

  const guildData = getGuild(message.guild.id);
  const userData = getUser(
    message.guild.id,
    message.author.id
  );

  // ========================================================
  // ANTILINK AUTOMÁTICO
  // ========================================================

  if (
    guildData.antiLink &&
    !admin(message) &&
    /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(
      message.content
    )
  ) {
    try {
      await message.delete();
    } catch {}

    try {
      if (
        message.member.moderatable &&
        message.guild.members.me.permissions.has(
          PermissionsBitField.Flags.ModerateMembers
        )
      ) {
        await message.member.timeout(
          2 * 60 * 60 * 1000,
          "Madokami AntiLink"
        );
      }
    } catch {}

    await log(
      message.guild,
      "🔗 ANTILINK",
      `👤 Usuario: ${message.author}\n⏱️ Timeout: 2 horas`,
      0xff4444
    );

    return;
  }

  if (!message.content.startsWith(PREFIX)) return;

  const parts = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = parts.shift()?.toLowerCase();
  const args = parts;

  if (!command) return;

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
    if (!admin(message))
      return message.reply(
        "❌ Solo los administradores pueden utilizar `m!helpad`."
      );

    return message.reply({
      embeds: [adminHelp()]
    });
  }

  // ========================================================
  // BALANCE
  // ========================================================

  if (command === "balance" || command === "bal") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 💰 TU CARTERA ━━╮",
          [
            `👤 **Usuario:** ${message.author}`,
            "",
            `💵 **Dinero:** ${money(userData.wallet)}`,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "🌸 Sigue usando los comandos de economía."
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // WORK
  // ========================================================

  if (command === "work") {
    const cd = cooldown(message.author.id, "work", 30);

    if (cd)
      return message.reply({
        embeds: [
          embed(
            "⏳ ╭━━ TRABAJO ━━╮",
            `💼 Ya trabajaste recientemente.\n\n⏱️ Puedes volver en **${cd} segundos**.`,
            0xffcc66
          )
        ]
      });

    const amount = random(100, 300);

    userData.wallet += amount;
    const levelUp = addXP(message.guild.id, message.author.id, 10);

    saveData();

    return message.reply({
      embeds: [
        embed(
          "💼 ╭━━ TRABAJO COMPLETADO ━━╮",
          [
            `👤 **Trabajador:** ${message.author}`,
            "",
            `💵 **Ganancia:** +${money(amount)}`,
            `💰 **Balance:** ${money(userData.wallet)}`,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "⏳ Próximo trabajo: **30 segundos**",
            levelUp ? "🎉 **¡SUBISTE DE NIVEL!**" : ""
          ].join("\n"),
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // RISK
  // ========================================================

  if (command === "risk") {
    const cd = cooldown(message.author.id, "risk", 60);

    if (cd)
      return message.reply({
        embeds: [
          embed(
            "⏳ ╭━━ RIESGO ━━╮",
            `🎰 Ya lo intentaste.\n\n⏱️ Espera **${cd} segundos**.`,
            0xffcc66
          )
        ]
      });

    if (Math.random() < 0.30) {
      const amount = random(300, 550);

      userData.wallet += amount;
      saveData();

      return message.reply({
        embeds: [
          embed(
            "🎰 ╭━━ ¡GANASTE! ━━╮",
            [
              "✨ La suerte estuvo de tu lado.",
              "",
              `💵 **Premio:** +${money(amount)}`,
              `💰 **Balance:** ${money(userData.wallet)}`,
              "",
              "🍀 Probabilidad: **30%**",
              "⏳ Cooldown: **1 minuto**"
            ].join("\n"),
            0x66cc88
          )
        ]
      });
    }

    const loss = random(300, 500);

    userData.wallet = Math.max(
      0,
      userData.wallet - loss
    );

    saveData();

    return message.reply({
      embeds: [
        embed(
          "🎰 ╭━━ PERDISTE ━━╮",
          [
            "💥 La suerte no estuvo de tu lado.",
            "",
            `💸 **Pérdida:** -${money(loss)}`,
            `💰 **Balance:** ${money(userData.wallet)}`,
            "",
            "🍀 Probabilidad de ganar: **30%**",
            "⏳ Cooldown: **1 minuto**"
          ].join("\n"),
          0xff6666
        )
      ]
    });
  }

  // ========================================================
  // CRIME
  // ========================================================

  if (command === "crime") {
    const cd = cooldown(message.author.id, "crime", 120);

    if (cd)
      return message.reply({
        embeds: [
          embed(
            "⏳ ╭━━ CRIME ━━╮",
            `🚨 Ya realizaste una operación.\n\n⏱️ Espera **${cd} segundos**.`,
            0xffcc66
          )
        ]
      });

    if (Math.random() < 0.20) {
      const amount = random(500, 700);

      userData.wallet += amount;
      saveData();

      return message.reply({
        embeds: [
          embed(
            "🚨 ╭━━ OPERACIÓN EXITOSA ━━╮",
            [
              "✨ La operación salió bien.",
              "",
              `💵 **Ganancia:** +${money(amount)}`,
              `💰 **Balance:** ${money(userData.wallet)}`,
              "",
              "🍀 Probabilidad: **20%**",
              "⏳ Cooldown: **2 minutos**"
            ].join("\n"),
            0x66cc88
          )
        ]
      });
    }

    userData.wallet = Math.max(
      0,
      userData.wallet - 600
    );

    saveData();

    return message.reply({
      embeds: [
        embed(
          "🚨 ╭━━ OPERACIÓN FALLIDA ━━╮",
          [
            "💥 La operación salió mal.",
            "",
            "💸 **Pérdida:** -600 pesos",
            `💰 **Balance:** ${money(userData.wallet)}`,
            "",
            "🍀 Probabilidad: **20%**",
            "⏳ Cooldown: **2 minutos**"
          ].join("\n"),
          0xff6666
        )
      ]
    });
  }

  // ========================================================
  // PAY
  // ========================================================

  if (command === "pay") {
    const target = message.mentions.users.first();
    const amount = Number(args.find(x => /^\d+$/.test(x)));

    if (!target)
      return message.reply(
        "❌ Debes mencionar a un usuario."
      );

    if (!amount || amount <= 0)
      return message.reply(
        "❌ Especifica una cantidad válida."
      );

    if (target.id === message.author.id)
      return message.reply(
        "❌ No puedes enviarte dinero a ti mismo."
      );

    if (userData.wallet < amount)
      return message.reply(
        "❌ No tienes suficiente dinero."
      );

    const receiver = getUser(
      message.guild.id,
      target.id
    );

    userData.wallet -= amount;
    receiver.wallet += amount;

    saveData();

    return message.reply({
      embeds: [
        embed(
          "💸 ╭━━ TRANSFERENCIA ━━╮",
          [
            `👤 **Remitente:** ${message.author}`,
            `👤 **Destinatario:** ${target}`,
            "",
            `💵 **Cantidad:** ${money(amount)}`,
            `💰 **Tu balance:** ${money(userData.wallet)}`,
            "",
            "✅ Transferencia completada."
          ].join("\n"),
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // PROFILE
  // ========================================================

  if (command === "profile") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("╭━━ 🌸 PERFIL ━━╮")
          .setThumbnail(
            message.author.displayAvatarURL({
              size: 512
            })
          )
          .setDescription(
            [
              `👤 **Usuario:** ${message.author}`,
              "",
              `💰 **Dinero:** ${money(userData.wallet)}`,
              `⭐ **Nivel:** ${userData.level}`,
              `✨ **XP:** ${userData.xp}`,
              "",
              "━━━━━━━━━━━━━━━━━━━━",
              "🌸 Perfil de Madokami"
            ].join("\n")
          )
          .setColor(0xff8fc7)
      ]
    });
  }

  // ========================================================
  // USERINFO
  // ========================================================

  if (command === "userinfo") {
    const target =
      message.mentions.users.first() ||
      message.author;

    const member =
      message.guild.members.cache.get(target.id);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("╭━━ 👤 USER INFO ━━╮")
          .setThumbnail(
            target.displayAvatarURL({
              size: 512
            })
          )
          .setDescription(
            [
              `👤 **Usuario:** ${target.tag}`,
              `🆔 **ID:** ${target.id}`,
              "",
              `📅 **Cuenta:** <t:${Math.floor(
                target.createdTimestamp / 1000
              )}:F>`,
              member
                ? `📥 **Entró:** <t:${Math.floor(
                    member.joinedTimestamp / 1000
                  )}:F>`
                : ""
            ].join("\n")
          )
          .setColor(0xff8fc7)
      ]
    });
  }

  // ========================================================
  // SERVERINFO
  // ========================================================

  if (command === "serverinfo") {
    const g = message.guild;

    return message.reply({
      embeds: [
        embed(
          `╭━━ 🏠 ${g.name} ━━╮`,
          [
            `👥 **Miembros:** ${g.memberCount}`,
            `💬 **Canales:** ${g.channels.cache.size}`,
            `🎭 **Roles:** ${g.roles.cache.size}`,
            `🆔 **ID:** ${g.id}`,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "🌸 Información del servidor"
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // AVATAR
  // ========================================================

  if (command === "avatar") {
    const target =
      message.mentions.users.first() ||
      message.author;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle("╭━━ 🖼️ AVATAR ━━╮")
          .setDescription(
            `👤 **${target.tag}**\n\n[🔗 Abrir imagen](${target.displayAvatarURL({
              size: 2048
            })})`
          )
          .setImage(
            target.displayAvatarURL({
              size: 1024
            })
          )
          .setColor(0xff8fc7)
      ]
    });
  }

  // ========================================================
  // BOTINFO
  // ========================================================

  if (command === "botinfo") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 🌸 MADOKAMI ━━╮",
          [
            "✨ **Bot de Discord**",
            "",
            `⌨️ **Prefix:** \`m!\``,
            `🏠 **Servidores:** ${client.guilds.cache.size}`,
            `📡 **Ping:** ${client.ws.ping}ms`,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "🌸 Madokami"
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // PING
  // ========================================================

  if (command === "ping") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 🏓 PONG ━━╮",
          [
            `📡 **Latencia:** ${client.ws.ping}ms`,
            "",
            "🟢 Madokami está funcionando."
          ].join("\n"),
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // 8BALL
  // ========================================================

  if (command === "8ball") {
    if (!args.length)
      return message.reply(
        "❌ Escribe una pregunta."
      );

    const answers = [
      "✨ Sí.",
      "❌ No.",
      "🍀 Probablemente.",
      "🌙 Puede ser.",
      "🔮 Definitivamente.",
      "🤔 No estoy seguro."
    ];

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔮 8BALL ━━╮",
          [
            `❓ **Pregunta:** ${args.join(" ")}`,
            "",
            `🔮 **Respuesta:** ${
              answers[random(0, answers.length - 1)]
            }`
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // COINFLIP
  // ========================================================

  if (command === "coinflip") {
    const result =
      Math.random() < 0.5 ? "CARA" : "CRUZ";

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🪙 COINFLIP ━━╮",
          `🪙 La moneda cayó en **${result}**.`
        )
      ]
    });
  }

  // ========================================================
  // DICE
  // ========================================================

  if (command === "dice") {
    const result = random(1, 6);

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🎲 DADO ━━╮",
          `🎲 Has sacado un **${result}**.`
        )
      ]
    });
  }

  // ========================================================
  // JOKE
  // ========================================================

  if (command === "joke") {
    const jokes = [
      "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "😂 ¿Qué le dijo un techo a otro? Techo de menos.",
      "😂 ¿Cuál es el café más peligroso? El ex-preso.",
      "😂 ¿Qué hace una computadora cuando tiene frío? Se pone Windows."
    ];

    return message.reply({
      embeds: [
        embed(
          "╭━━ 😂 CHISTE ━━╮",
          jokes[random(0, jokes.length - 1)]
        )
      ]
    });
  }

  // ========================================================
  // HUG
  // ========================================================

  if (command === "hug") {
    const target = message.mentions.users.first();

    if (!target)
      return message.reply(
        "❌ Menciona a alguien."
      );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🤗 ABRAZO ━━╮",
          `🤗 ${message.author} le dio un abrazo a ${target}.`
        )
      ]
    });
  }

  // ========================================================
  // PAT
  // ========================================================

  if (command === "pat") {
    const target = message.mentions.users.first();

    if (!target)
      return message.reply(
        "❌ Menciona a alguien."
      );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🫳 PAT ━━╮",
          `🫳 ${message.author} le dio palmaditas a ${target}.`
        )
      ]
    });
  }

  // ========================================================
  // RANK / LEVEL
  // ========================================================

  if (command === "rank" || command === "level") {
    const required = userData.level * 100;

    return message.reply({
      embeds: [
        embed(
          "╭━━ 📊 TU NIVEL ━━╮",
          [
            `👤 **Usuario:** ${message.author}`,
            "",
            `⭐ **Nivel:** ${userData.level}`,
            `✨ **XP:** ${userData.xp}/${required}`,
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "🌸 Sigue usando comandos para ganar XP."
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // LEVELS
  // ========================================================

  if (command === "levels") {
    const users = Object.entries(
      guildData.users
    )
      .sort((a, b) => {
        return (
          (b[1].level * 100 + b[1].xp) -
          (a[1].level * 100 + a[1].xp)
        );
      })
      .slice(0, 10);

    let text = "";

    if (!users.length) {
      text = "🌱 Todavía no hay usuarios con XP.";
    } else {
      users.forEach(([id, u], i) => {
        text += `${i + 1}. <@${id}> — ⭐ Nivel ${u.level} (${u.xp} XP)\n`;
      });
    }

    return message.reply({
      embeds: [
        embed(
          "╭━━ 📊 CLASIFICACIÓN ━━╮",
          text
        )
      ]
    });
  }

  // ========================================================
  // POLL
  // ========================================================

  if (command === "poll") {
    if (!args.length)
      return message.reply(
        "❌ Escribe una pregunta."
      );

    const msg = await message.channel.send({
      embeds: [
        embed(
          "╭━━ 📊 ENCUESTA ━━╮",
          `❓ ${args.join(" ")}\n\n👍 **Sí**\n👎 **No**`
        )
      ]
    });

    await msg.react("👍");
    await msg.react("👎");

    return;
  }

  // ========================================================
  // REMIND
  // ========================================================

  if (command === "remind") {
    const seconds = Number(args[0]);

    if (!Number.isInteger(seconds) || seconds <= 0) {
      return message.reply(
        "❌ Uso: `m!remind segundos mensaje`"
      );
    }

    const reminder = args.slice(1).join(" ");

    if (!reminder)
      return message.reply(
        "❌ Escribe el mensaje del recordatorio."
      );

    if (seconds > 86400)
      return message.reply(
        "❌ El máximo es 24 horas."
      );

    await message.reply({
      embeds: [
        embed(
          "╭━━ ⏰ RECORDATORIO ━━╮",
          [
            `📝 **Mensaje:** ${reminder}`,
            `⏱️ **Tiempo:** ${seconds} segundos`,
            "",
            "✅ Recordatorio creado."
          ].join("\n"),
          0x66cc88
        )
      ]
    });

    setTimeout(async () => {
      try {
        await message.channel.send({
          embeds: [
            embed(
              "╭━━ ⏰ RECORDATORIO ━━╮",
              `🔔 ${message.author}\n\n📝 **${reminder}**`
            )
          ]
        });
      } catch {}
    }, seconds * 1000);

    return;
  }

  // ========================================================
  // PREFIX
  // ========================================================

  if (command === "prefix") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ ⌨️ PREFIX ━━╮",
          "🌸 El prefix de Madokami es:\n\n`m!`"
        )
      ]
    });
  }

  // ========================================================
  // ABOUT
  // ========================================================

  if (command === "about") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 🌸 SOBRE MADOKAMI ━━╮",
          [
            "✨ Madokami es un bot de Discord.",
            "",
            "💰 Economía",
            "🎮 Diversión",
            "🤝 Social",
            "📊 Niveles",
            "🛡️ Administración",
            "",
            "━━━━━━━━━━━━━━━━━━━━",
            "⌨️ Prefix: `m!`"
          ].join("\n")
        )
      ]
    });
  }

  // ========================================================
  // INVITE
  // ========================================================

  if (command === "invite") {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 🌸 INVITAR MADOKAMI ━━╮",
          [
            "✨ Puedes invitar Madokami utilizando",
            "el enlace de instalación configurado",
            "en el Discord Developer Portal.",
            "",
            "🔐 Usa solamente el enlace oficial"
          ].join("\n")
        )
      ]
    });
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
    "antilink",
    "log",
    "slowmode",
    "lock",
    "unlock"
  ];

  if (adminCommands.includes(command) && !admin(message)) {
    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔒 ACCESO DENEGADO ━━╮",
          "❌ Necesitas permisos de **Administrador** para utilizar este comando.",
          0xff5555
        )
      ]
    });
  }

  // ========================================================
  // BAN
  // ========================================================

  if (command === "ban") {
    const target = message.mentions.members.first();

    if (!target)
      return message.reply(
        "❌ Menciona al usuario que quieres banear."
      );

    if (!target.bannable)
      return message.reply(
        "❌ No puedo banear a ese usuario."
      );

    const reason =
      args.slice(1).join(" ") || "Sin razón";

    await target.ban({ reason });

    await log(
      message.guild,
      "🔨 BAN",
      `👤 ${target.user.tag}\n📝 ${reason}`
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔨 USUARIO BANEADO ━━╮",
          [
            `👤 **Usuario:** ${target.user.tag}`,
            `📝 **Razón:** ${reason}`,
            "",
            "✅ Acción completada."
          ].join("\n"),
          0xff5555
        )
      ]
    });
  }

  // ========================================================
  // UNBAN
  // ========================================================

  if (command === "unban") {
    const id = args[0];

    if (!id)
      return message.reply(
        "❌ Especifica el ID."
      );

    try {
      await message.guild.members.unban(id);

      return message.reply({
        embeds: [
          embed(
            "╭━━ 🔓 UNBAN ━━╮",
            `✅ El usuario **${id}** fue desbaneado.`,
            0x66cc88
          )
        ]
      });
    } catch {
      return message.reply(
        "❌ No pude desbanear ese ID."
      );
    }
  }

  // ========================================================
  // KICK
  // ========================================================

  if (command === "kick") {
    const target = message.mentions.members.first();

    if (!target)
      return message.reply(
        "❌ Menciona al usuario."
      );

    if (!target.kickable)
      return message.reply(
        "❌ No puedo expulsar a ese usuario."
      );

    const reason =
      args.slice(1).join(" ") || "Sin razón";

    await target.kick(reason);

    await log(
      message.guild,
      "👢 KICK",
      `👤 ${target.user.tag}\n📝 ${reason}`
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 👢 USUARIO EXPULSADO ━━╮",
          `👤 **${target.user.tag}** fue expulsado.`,
          0xff8844
        )
      ]
    });
  }

  // ========================================================
  // MUTE
  // ========================================================

  if (command === "mute") {
    const target = message.mentions.members.first();

    if (!target)
      return message.reply(
        "❌ Menciona al usuario."
      );

    if (!target.moderatable)
      return message.reply(
        "❌ No puedo aplicar timeout."
      );

    await target.timeout(
      2 * 60 * 60 * 1000,
      "Madokami mute"
    );

    await log(
      message.guild,
      "🔇 MUTE",
      `👤 ${target.user.tag}\n⏱️ 2 horas`
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔇 USUARIO MUTEADO ━━╮",
          `👤 ${target}\n\n⏱️ Duración: **2 horas**`,
          0xffaa44
        )
      ]
    });
  }

  // ========================================================
  // UNMUTE
  // ========================================================

  if (command === "unmute") {
    const target = message.mentions.members.first();

    if (!target)
      return message.reply(
        "❌ Menciona al usuario."
      );

    await target.timeout(null);

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔊 UNMUTE ━━╮",
          `✅ ${target} ya no tiene timeout.`,
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // WARN
  // ========================================================

  if (command === "warn") {
    const target = message.mentions.members.first();

    if (!target)
      return message.reply(
        "❌ Menciona al usuario."
      );

    const reason =
      args.slice(1).join(" ") || "Sin razón";

    const targetData = getUser(
      message.guild.id,
      target.id
    );

    targetData.warnings.push({
      reason,
      moderator: message.author.id,
      date: Date.now()
    });

    saveData();

    await log(
      message.guild,
      "⚠️ WARN",
      `👤 ${target.user.tag}\n📝 ${reason}`
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ ⚠️ ADVERTENCIA ━━╮",
          [
            `👤 **Usuario:** ${target.user.tag}`,
            `📝 **Razón:** ${reason}`,
            `📊 **Advertencias:** ${targetData.warnings.length}`,
            "",
            "✅ Advertencia guardada."
          ].join("\n"),
          0xffcc44
        )
      ]
    });
  }

  // ========================================================
  // WARNINGS
  // ========================================================

  if (command === "warnings") {
    const target =
      message.mentions.members.first() ||
      message.member;

    const targetData = getUser(
      message.guild.id,
      target.id
    );

    if (!targetData.warnings.length) {
      return message.reply({
        embeds: [
          embed(
            "╭━━ 📋 WARNINGS ━━╮",
            `✅ **${target.user.tag}** no tiene advertencias.`
          )
        ]
      });
    }

    let text = "";

    targetData.warnings.forEach((w, i) => {
      text += `**${i + 1}.** ${w.reason}\n`;
      text += `👮 <@${w.moderator}>\n`;
      text += `📅 <t:${Math.floor(w.date / 1000)}:R>\n\n`;
    });

    return message.reply({
      embeds: [
        embed(
          `╭━━ 📋 WARNINGS: ${target.user.username} ━━╮`,
          text,
          0xffcc44
        )
      ]
    });
  }

  // ========================================================
  // CLEAR
  // ========================================================

  if (command === "clear") {
    const amount = Number(args[0]);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      return message.reply(
        "❌ Usa una cantidad entre 1 y 100."
      );
    }

    try {
      const deleted =
        await message.channel.bulkDelete(amount, true);

      return message.channel.send({
        embeds: [
          embed(
            "╭━━ 🧹 LIMPIEZA ━━╮",
            `🗑️ Se eliminaron **${deleted.size} mensajes**.`,
            0x66cc88
          )
        ]
      });
    } catch {
      return message.reply(
        "❌ No pude eliminar los mensajes."
      );
    }
  }

  // ========================================================
  // ANTILINK
  // ========================================================

  if (command === "antilink") {
    const option = args[0]?.toLowerCase();

    if (option === "on") {
      guildData.antiLink = true;
      saveData();

      return message.reply({
        embeds: [
          embed(
            "╭━━ 🔒 ANTILINK ━━╮",
            [
              "🟢 **Sistema activado**",
              "",
              "🔗 Los enlaces serán eliminados.",
              "🔇 El usuario recibirá 2 horas de timeout."
            ].join("\n"),
            0x66cc88
          )
        ]
      });
    }

    if (option === "off") {
      guildData.antiLink = false;
      saveData();

      return message.reply({
        embeds: [
          embed(
            "╭━━ 🔓 ANTILINK ━━╮",
            "🔴 **Sistema desactivado.**",
            0xff5555
          )
        ]
      });
    }

    return message.reply(
      "❌ Usa `m!antilink on` o `m!antilink off`."
    );
  }

  // ========================================================
  // LOG
  // ========================================================

  if (command === "log") {
    if (args[0]?.toLowerCase() === "off") {
      guildData.logChannel = null;
      saveData();

      return message.reply({
        embeds: [
          embed(
            "╭━━ 📋 LOGS ━━╮",
            "🔴 Los logs fueron desactivados.",
            0xff5555
          )
        ]
      });
    }

    const channel =
      message.mentions.channels.first();

    if (!channel)
      return message.reply(
        "❌ Usa `m!log #canal`."
      );

    guildData.logChannel = channel.id;
    saveData();

    return message.reply({
      embeds: [
        embed(
          "╭━━ 📋 LOGS CONFIGURADOS ━━╮",
          `✅ Los logs se enviarán en ${channel}.`,
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // SLOWMODE
  // ========================================================

  if (command === "slowmode") {
    const seconds = Number(args[0]);

    if (
      !Number.isInteger(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply(
        "❌ Usa un valor entre 0 y 21600 segundos."
      );
    }

    await message.channel.setRateLimitPerUser(seconds);

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🐌 SLOWMODE ━━╮",
          `⏱️ Slowmode establecido en **${seconds} segundos**.`,
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // LOCK
  // ========================================================

  if (command === "lock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔒 CANAL BLOQUEADO ━━╮",
          "🚫 Nadie podrá enviar mensajes en este canal.",
          0xff5555
        )
      ]
    });
  }

  // ========================================================
  // UNLOCK
  // ========================================================

  if (command === "unlock") {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    return message.reply({
      embeds: [
        embed(
          "╭━━ 🔓 CANAL DESBLOQUEADO ━━╮",
          "💬 Los usuarios pueden volver a enviar mensajes.",
          0x66cc88
        )
      ]
    });
  }

  // ========================================================
  // UNKNOWN
  // ========================================================

  return message.reply({
    embeds: [
      embed(
        "╭━━ ❓ COMANDO DESCONOCIDO ━━╮",
        [
          "❌ Ese comando no existe.",
          "",
          `🌸 Usa \`${PREFIX}help\` para ver todos los comandos.`
        ].join("\n"),
        0xff5555
      )
    ]
  });
});

// ============================================================
// WEB SERVER PARA HOSTING
// ============================================================

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain"
    });

    res.end("🌸 Madokami está conectado correctamente.");
  })
  .listen(PORT, () => {
    console.log(`🌐 Puerto ${PORT} activo.`);
  });

// ============================================================
// START
// ============================================================

loadData();

if (!TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

client.login(TOKEN).catch(err => {
  console.error("❌ Error iniciando Madokami:");
  console.error(err);
});
