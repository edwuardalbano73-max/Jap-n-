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
  ChannelType,
  Events
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ============================================================
// ⚙️ CONFIGURACIÓN
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

// ============================================================
// 💾 BASE DE DATOS
// ============================================================

let db = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
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

function getGuild(guildId) {
  if (!db[guildId]) {
    db[guildId] = {
      config: {
        antiLink: false,
        antiSpam: false,
        logChannel: null,
        welcome: false,
        welcomeChannel: null,
        welcomeMessage: "🌸 Bienvenido/a {user} a {server}!",
        autoRole: null,
        prefix: "m!"
      },
      users: {},
      warns: {},
      messageCache: {}
    };

    saveDB();
  }

  return db[guildId];
}

function getUser(guildId, userId) {
  const guild = getGuild(guildId);

  if (!guild.users[userId]) {
    guild.users[userId] = {
      wallet: 0,
      xp: 0,
      level: 1
    };
    saveDB();
  }

  return guild.users[userId];
}

// ============================================================
// 🎨 EMBEDS
// ============================================================

function embed(title, description) {
  return new EmbedBuilder()
    .setColor(0xE8A7FF)
    .setTitle(`🌸 ${title}`)
    .setDescription(description)
    .setFooter({
      text: "Madokami • Sistema del servidor"
    })
    .setTimestamp();
}

function errorEmbed(text) {
  return new EmbedBuilder()
    .setColor(0xFF4D6D)
    .setTitle("❌ Madokami")
    .setDescription(text)
    .setTimestamp();
}

function successEmbed(text) {
  return new EmbedBuilder()
    .setColor(0xB8F2E6)
    .setTitle("🌸 Madokami")
    .setDescription(text)
    .setTimestamp();
}

// ============================================================
// 📜 LOGS
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
      .setTitle(`🌸 ${title}`)
      .setDescription(description)
      .setFooter({
        text: `Madokami Logs • ${guild.name}`
      })
      .setTimestamp();

    await channel.send({ embeds: [logEmbed] });
  } catch (err) {
    console.error("Error enviando log:", err);
  }
}

// ============================================================
// ⏱️ COOLDOWNS
// ============================================================

const cooldowns = new Map();

function cooldown(key, time) {
  const now = Date.now();

  if (cooldowns.has(key)) {
    const remaining = cooldowns.get(key) - now;

    if (remaining > 0) {
      return Math.ceil(remaining / 1000);
    }
  }

  cooldowns.set(key, now + time);
  return 0;
}

// ============================================================
// 🚨 ANTI-SPAM
// ============================================================

const spamMap = new Map();

function checkSpam(message) {
  if (!message.guild || !message.member) return false;

  if (
    message.member.permissions.has(
      PermissionsBitField.Flags.Administrator
    )
  ) {
    return false;
  }

  const key = `${message.guild.id}-${message.author.id}`;
  const now = Date.now();

  if (!spamMap.has(key)) {
    spamMap.set(key, []);
  }

  const timestamps = spamMap.get(key).filter(
    t => now - t < 5000
  );

  timestamps.push(now);
  spamMap.set(key, timestamps);

  return timestamps.length >= 6;
}

// ============================================================
// 🔗 LINKS
// ============================================================

function containsLink(content) {
  return /(https?:\/\/|www\.|discord\.gg\/|discord\.com\/invite\/)/i.test(
    content
  );
}

// ============================================================
// 📈 XP
// ============================================================

function addXP(guildId, userId, amount) {
  const user = getUser(guildId, userId);

  user.xp += amount;

  const required = user.level * 100;

  if (user.xp >= required) {
    user.xp -= required;
    user.level++;

    saveDB();

    return true;
  }

  saveDB();
  return false;
}

// ============================================================
// 🔧 PERMISOS
// ============================================================

function isAdmin(message) {
  return message.member?.permissions.has(
    PermissionsBitField.Flags.Administrator
  );
}

function mentionUser(message, args) {
  return message.mentions.members.first();
}

// ============================================================
// 🤖 READY
// ============================================================

client.once(Events.ClientReady, () => {
  console.log("======================================");
  console.log("🌸 MADOKAMI ESTÁ CONECTADO");
  console.log(`🤖 ${client.user.tag}`);
  console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
  console.log(`⌨️ Prefix: ${PREFIX}`);
  console.log("======================================");

  client.user.setActivity(`${PREFIX}help | Madokami`, {
    type: 0
  });
});

// ============================================================
// 👋 ENTRADA DE MIEMBROS
// ============================================================

client.on(Events.GuildMemberAdd, async member => {
  const data = getGuild(member.guild.id);

  await sendLog(
    member.guild,
    "MIEMBRO ENTRÓ",
    `👤 Usuario: ${member}\n🆔 ID: \`${member.id}\`\n📅 Cuenta creada: <t:${Math.floor(member.user.createdTimestamp / 1000)}:F>`,
    0xB8F2E6
  );

  if (data.config.autoRole) {
    const role = member.guild.roles.cache.get(
      data.config.autoRole
    );

    if (role) {
      try {
        await member.roles.add(role);
      } catch {}
    }
  }

  if (data.config.welcome && data.config.welcomeChannel) {
    const channel = member.guild.channels.cache.get(
      data.config.welcomeChannel
    );

    if (channel?.isTextBased()) {
      const text = data.config.welcomeMessage
        .replaceAll("{user}", `${member}`)
        .replaceAll("{server}", member.guild.name);

      channel.send({
        embeds: [embed("🌸 Bienvenido/a", text)]
      }).catch(() => {});
    }
  }
});

// ============================================================
// 🚪 SALIDA
// ============================================================

client.on(Events.GuildMemberRemove, async member => {
  await sendLog(
    member.guild,
    "MIEMBRO SALIÓ",
    `👤 Usuario: **${member.user.tag}**\n🆔 ID: \`${member.id}\``,
    0xFF8FA3
  );
});

// ============================================================
// 📝 MENSAJES
// ============================================================

client.on(Events.MessageDelete, async message => {
  if (!message.guild) return;

  const cached =
    message.guild._madokamiMessages?.get(message.id);

  const content =
    message.content ||
    cached?.content ||
    "Contenido no disponible";

  await sendLog(
    message.guild,
    "MENSAJE ELIMINADO",
    `👤 Usuario: ${message.author || "Desconocido"}\n` +
    `📍 Canal: ${message.channel}\n` +
    `💬 Contenido:\n> ${content.slice(0, 1000)}`,
    0xFF6B6B
  );
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!oldMessage.guild) return;

  if (oldMessage.partial) {
    try {
      await oldMessage.fetch();
    } catch {}
  }

  if (newMessage.partial) {
    try {
      await newMessage.fetch();
    } catch {}
  }

  if (oldMessage.content === newMessage.content) return;

  await sendLog(
    oldMessage.guild,
    "MENSAJE EDITADO",
    `👤 Usuario: ${newMessage.author}\n` +
    `📍 Canal: ${newMessage.channel}\n\n` +
    `🔴 **Antes:**\n> ${(oldMessage.content || "Sin contenido").slice(0, 700)}\n\n` +
    `🟢 **Después:**\n> ${(newMessage.content || "Sin contenido").slice(0, 700)}`,
    0xFFD166
  );
});

// ============================================================
// 📦 CACHE DE MENSAJES
// ============================================================

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  if (!message.guild._madokamiMessages) {
    message.guild._madokamiMessages = new Map();
  }

  message.guild._madokamiMessages.set(message.id, {
    content: message.content,
    author: message.author.id,
    channel: message.channel.id
  });

  if (message.guild._madokamiMessages.size > 500) {
    const first =
      message.guild._madokamiMessages.keys().next().value;

    message.guild._madokamiMessages.delete(first);
  }
});

// ============================================================
// 🚨 ANTI-LINK + ANTI-SPAM
// ============================================================

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;

  const data = getGuild(message.guild.id);

  // ---------------- ANTI-LINK ----------------

  if (
    data.config.antiLink &&
    containsLink(message.content) &&
    !isAdmin(message)
  ) {
    try {
      await message.delete();
    } catch {}

    await sendLog(
      message.guild,
      "ANTI-LINK",
      `👤 Usuario: ${message.author}\n` +
      `📍 Canal: ${message.channel}\n` +
      `🔗 Mensaje eliminado por contener un enlace.\n` +
      `🔇 Acción: Timeout de 2 horas.`,
      0xFF4D6D
    );

    try {
      if (message.member.moderatable) {
        await message.member.timeout(
          2 * 60 * 60 * 1000,
          "Madokami Anti-Link"
        );
      }
    } catch {}

    return;
  }

  // ---------------- ANTI-SPAM ----------------

  if (data.config.antiSpam && checkSpam(message)) {
    try {
      await message.delete();
    } catch {}

    const guild = getGuild(message.guild.id);

    if (!guild.warns[message.author.id]) {
      guild.warns[message.author.id] = [];
    }

    guild.warns[message.author.id].push({
      reason: "Anti-Spam: más de 5 mensajes seguidos",
      moderator: client.user.id,
      timestamp: Date.now()
    });

    saveDB();

    await sendLog(
      message.guild,
      "ANTI-SPAM",
      `👤 Usuario: ${message.author}\n` +
      `📍 Canal: ${message.channel}\n` +
      `⚠️ Motivo: Más de 5 mensajes seguidos.\n` +
      `🗑️ Mensaje eliminado.\n` +
      `⚠️ Warn automático aplicado.`,
      0xFFB703
    );

    try {
      await message.channel.send({
        embeds: [
          errorEmbed(
            `⚠️ ${message.author}, has enviado demasiados mensajes seguidos.\n\n` +
            `Se ha eliminado tu mensaje y has recibido **1 warn**.`
          )
        ]
      }).then(msg => {
        setTimeout(() => msg.delete().catch(() => {}), 5000);
      });
    } catch {}

    spamMap.delete(
      `${message.guild.id}-${message.author.id}`
    );
  }
});

// ============================================================
// 🎭 ROLES
// ============================================================

client.on(Events.GuildRoleCreate, async role => {
  await sendLog(
    role.guild,
    "ROL CREADO",
    `🎭 Rol: ${role}\n📝 Nombre: **${role.name}**\n🆔 ID: \`${role.id}\``,
    0xB8F2E6
  );
});

client.on(Events.GuildRoleDelete, async role => {
  await sendLog(
    role.guild,
    "ROL ELIMINADO",
    `🎭 Nombre: **${role.name}**\n🆔 ID: \`${role.id}\``,
    0xFF6B6B
  );
});

client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  if (oldRole.name !== newRole.name) {
    await sendLog(
      newRole.guild,
      "ROL MODIFICADO",
      `🎭 Rol: ${newRole}\n` +
      `🔴 Antes: **${oldRole.name}**\n` +
      `🟢 Después: **${newRole.name}**`,
      0xFFD166
    );
  }
});

// ============================================================
// 📁 CANALES
// ============================================================

client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "CANAL CREADO",
    `📁 Canal: ${channel}\n` +
    `📝 Nombre: **${channel.name}**\n` +
    `📌 Tipo: **${channel.type}**`,
    0xB8F2E6
  );
});

client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;

  await sendLog(
    channel.guild,
    "CANAL ELIMINADO",
    `📁 Nombre: **${channel.name}**\n` +
    `🆔 ID: \`${channel.id}\``,
    0xFF6B6B
  );
});

client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;

  if (oldChannel.name !== newChannel.name) {
    await sendLog(
      newChannel.guild,
      "CANAL MODIFICADO",
      `📁 Canal: ${newChannel}\n` +
      `🔴 Antes: **${oldChannel.name}**\n` +
      `🟢 Después: **${newChannel.name}**`,
      0xFFD166
    );
  }
});

// ============================================================
// 📋 COMANDOS
// ============================================================

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const args = message.content
    .slice(PREFIX.length)
    .trim()
    .split(/\s+/);

  const command = args.shift()?.toLowerCase();

  if (!command) return;

  const guild = getGuild(message.guild.id);
  const user = getUser(
    message.guild.id,
    message.author.id
  );

  // ========================================================
  // 🌸 MENÚ PRINCIPAL
  // ========================================================

  if (command === "help") {
    const menu = new StringSelectMenuBuilder()
      .setCustomId("madokami_help")
      .setPlaceholder("🌸 Selecciona una categoría")
      .addOptions([
        {
          label: "Economía",
          value: "economia",
          emoji: "💰"
        },
        {
          label: "Información",
          value: "info",
          emoji: "📚"
        },
        {
          label: "Diversión",
          value: "diversion",
          emoji: "🎮"
        },
        {
          label: "Social",
          value: "social",
          emoji: "💗"
        },
        {
          label: "Niveles",
          value: "niveles",
          emoji: "⭐"
        },
        {
          label: "Utilidades",
          value: "utilidades",
          emoji: "🛠️"
        },
        {
          label: "Madokami",
          value: "madokami",
          emoji: "🌸"
        }
      ]);

    return message.reply({
      embeds: [
        embed(
          "🌸 MADOKAMI",
          `Bienvenido/a al centro de comandos.\n\n` +
          `Selecciona una categoría para ver sus **15 comandos**.\n\n` +
          `👑 Los comandos administrativos están en \`${PREFIX}helpad\`.`
        )
      ],
      components: [
        new ActionRowBuilder().addComponents(menu)
      ]
    });
  }

  // ========================================================
  // 👑 HELP ADMIN
  // ========================================================

  if (command === "helpad") {
    if (!isAdmin(message)) {
      return message.reply({
        embeds: [
          errorEmbed("❌ Necesitas permisos de Administrador.")
        ]
      });
    }

    return message.reply({
      embeds: [
        embed(
          "👑 PANEL ADMINISTRATIVO",
          `**Moderación**\n` +
          `\`${PREFIX}ban\` • \`${PREFIX}unban\` • \`${PREFIX}kick\`\n` +
          `\`${PREFIX}mute\` • \`${PREFIX}unmute\` • \`${PREFIX}warn\`\n` +
          `\`${PREFIX}warnings\` • \`${PREFIX}clear\` • \`${PREFIX}slowmode\`\n\n` +
          `**Seguridad**\n` +
          `\`${PREFIX}antilink\` • \`${PREFIX}antispam\`\n\n` +
          `**Servidor**\n` +
          `\`${PREFIX}log\` • \`${PREFIX}lock\` • \`${PREFIX}unlock\`\n` +
          `\`${PREFIX}welcome\` • \`${PREFIX}autorole\``
        )
      ]
    });
  }

  // ========================================================
  // 💰 ECONOMÍA
  // ========================================================

  if (command === "balance" || command === "bal") {
    return message.reply({
      embeds: [
        embed(
          "💰 Balance",
          `💵 ${message.author}: **${user.wallet} pesos**`
        )
      ]
    });
  }

  if (command === "work") {
    const cd = cooldown(
      `${message.guild.id}-${message.author.id}-work`,
      30000
    );

    if (cd)
      return message.reply({
        embeds: [
          errorEmbed(`⏳ Espera **${cd}s** para volver a trabajar.`)
        ]
      });

    const amount =
      Math.floor(Math.random() * 201) + 100;

    user.wallet += amount;
    addXP(message.guild.id, message.author.id, 10);

    return message.reply({
      embeds: [
        successEmbed(
          `💼 Trabajaste y ganaste **${amount} pesos**.\n\n` +
          `💰 Nuevo balance: **${user.wallet} pesos**`
        )
      ]
    });
  }

  if (command === "risk") {
    const cd = cooldown(
      `${message.guild.id}-${message.author.id}-risk`,
      60000
    );

    if (cd)
      return message.reply({
        embeds: [
          errorEmbed(`⏳ Espera **${cd}s**.`)
        ]
      });

    if (Math.random() <= 0.3) {
      const amount =
        Math.floor(Math.random() * 251) + 300;

      user.wallet += amount;

      return message.reply({
        embeds: [
          successEmbed(
            `🎲 ¡Ganaste!\n\n💰 Recibiste **${amount} pesos**.`
          )
        ]
      });
    }

    const loss =
      Math.floor(Math.random() * 201) + 300;

    user.wallet = Math.max(0, user.wallet - loss);

    return message.reply({
      embeds: [
        errorEmbed(
          `🎲 Perdiste **${loss} pesos**.`
        )
      ]
    });
  }

  if (command === "crime") {
    const cd = cooldown(
      `${message.guild.id}-${message.author.id}-crime`,
      120000
    );

    if (cd)
      return message.reply({
        embeds: [
          errorEmbed(`⏳ Espera **${cd}s**.`)
        ]
      });

    if (Math.random() <= 0.2) {
      const amount =
        Math.floor(Math.random() * 201) + 500;

      user.wallet += amount;

      return message.reply({
        embeds: [
          successEmbed(
            `💰 ¡El golpe salió bien!\n\nGanaste **${amount} pesos**.`
          )
        ]
      });
    }

    user.wallet = Math.max(0, user.wallet - 600);

    return message.reply({
      embeds: [
        errorEmbed(
          "🚨 El golpe salió mal.\n\nPerdiste **600 pesos**."
        )
      ]
    });
  }

  if (command === "pay") {
    const target = message.mentions.users.first();
    const amount = Number(args[1]);

    if (!target || !amount || amount <= 0) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}pay @usuario cantidad\``)
        ]
      });
    }

    if (target.id === message.author.id) {
      return message.reply({
        embeds: [
          errorEmbed("❌ No puedes pagarte a ti mismo.")
        ]
      });
    }

    if (user.wallet < amount) {
      return message.reply({
        embeds: [
          errorEmbed("💰 No tienes suficiente dinero.")
        ]
      });
    }

    const targetUser = getUser(
      message.guild.id,
      target.id
    );

    user.wallet -= amount;
    targetUser.wallet += amount;

    saveDB();

    return message.reply({
      embeds: [
        successEmbed(
          `💸 Enviaste **${amount} pesos** a ${target}.`
        )
      ]
    });
  }

  if (command === "daily") {
    const cd = cooldown(
      `${message.guild.id}-${message.author.id}-daily`,
      86400000
    );

    if (cd)
      return message.reply({
        embeds: [
          errorEmbed(`⏳ Ya reclamaste tu recompensa diaria.`)
        ]
      });

    const amount = 1000;
    user.wallet += amount;

    return message.reply({
      embeds: [
        successEmbed(
          `🎁 Recompensa diaria: **${amount} pesos**.`
        )
      ]
    });
  }

  if (command === "deposit") {
    return message.reply({
      embeds: [
        embed(
          "💰 Banco",
          "Tu dinero se guarda automáticamente en tu cuenta."
        )
      ]
    });
  }

  if (command === "withdraw") {
    return message.reply({
      embeds: [
        embed(
          "💰 Retiro",
          "No necesitas retirar dinero: tu balance está disponible automáticamente."
        )
      ]
    });
  }

  if (command === "richest") {
    const list = Object.entries(guild.users)
      .sort((a, b) => b[1].wallet - a[1].wallet)
      .slice(0, 10);

    let text = "";

    list.forEach(([id, data], i) => {
      text += `**${i + 1}.** <@${id}> — 💰 ${data.wallet}\n`;
    });

    return message.reply({
      embeds: [
        embed("💰 Más ricos", text || "No hay datos todavía.")
      ]
    });
  }

  if (command === "give") {
    return message.reply({
      embeds: [
        errorEmbed(
          `Usa \`${PREFIX}pay @usuario cantidad\` para transferir dinero.`
        )
      ]
    });
  }

  if (command === "money") {
    return message.reply({
      embeds: [
        embed(
          "💰 Dinero",
          `Tu balance es **${user.wallet} pesos**.`
        )
      ]
    });
  }

  if (command === "economy") {
    return message.reply({
      embeds: [
        embed(
          "💰 Economía",
          `Usa \`${PREFIX}help\` → Economía para ver todos los comandos.`
        )
      ]
    });
  }

  // ========================================================
  // 📚 INFORMACIÓN
  // ========================================================

  if (command === "userinfo") {
    const target =
      message.mentions.members.first() || message.member;

    return message.reply({
      embeds: [
        embed(
          "👤 Información de usuario",
          `👤 Usuario: ${target}\n` +
          `🏷️ Tag: **${target.user.tag}**\n` +
          `🆔 ID: \`${target.id}\`\n` +
          `📅 Cuenta: <t:${Math.floor(target.user.createdTimestamp / 1000)}:F>`
        )
      ]
    });
  }

  if (command === "serverinfo") {
    return message.reply({
      embeds: [
        embed(
          "🏠 Información del servidor",
          `🏠 **${message.guild.name}**\n` +
          `👥 Miembros: **${message.guild.memberCount}**\n` +
          `📁 Canales: **${message.guild.channels.cache.size}**\n` +
          `🎭 Roles: **${message.guild.roles.cache.size}**\n` +
          `🆔 ID: \`${message.guild.id}\``
        )
      ]
    });
  }

  if (command === "avatar") {
    const target =
      message.mentions.users.first() || message.author;

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE8A7FF)
          .setTitle("🌸 Avatar")
          .setImage(
            target.displayAvatarURL({
              size: 1024,
              extension: "png"
            })
          )
      ]
    });
  }

  if (command === "id") {
    const target =
      message.mentions.users.first() || message.author;

    return message.reply({
      embeds: [
        embed(
          "🆔 ID",
          `${target}: \`${target.id}\``
        )
      ]
    });
  }

  if (command === "roles") {
    const roles = message.guild.roles.cache
      .filter(r => r.id !== message.guild.id)
      .map(r => r.toString())
      .slice(0, 30)
      .join(" ");

    return message.reply({
      embeds: [
        embed("🎭 Roles", roles || "No hay roles.")
      ]
    });
  }

  if (command === "channels") {
    const channels = message.guild.channels.cache
      .map(c => `${c} — \`${c.name}\``)
      .slice(0, 30)
      .join("\n");

    return message.reply({
      embeds: [
        embed("📁 Canales", channels)
      ]
    });
  }

  if (command === "members") {
    return message.reply({
      embeds: [
        embed(
          "👥 Miembros",
          `El servidor tiene **${message.guild.memberCount} miembros**.`
        )
      ]
    });
  }

  if (command === "icon") {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xE8A7FF)
          .setTitle("🌸 Icono del servidor")
          .setImage(
            message.guild.iconURL({
              size: 1024
            }) || null
          )
      ]
    });
  }

  if (command === "created") {
    return message.reply({
      embeds: [
        embed(
          "📅 Servidor creado",
          `<t:${Math.floor(message.guild.createdTimestamp / 1000)}:F>`
        )
      ]
    });
  }

  if (command === "owner") {
    const owner = await message.guild.fetchOwner();

    return message.reply({
      embeds: [
        embed(
          "👑 Dueño",
          `El dueño es ${owner}.`
        )
      ]
    });
  }

  if (command === "boost") {
    return message.reply({
      embeds: [
        embed(
          "🚀 Boosts",
          `Boosts actuales: **${message.guild.premiumSubscriptionCount || 0}**`
        )
      ]
    });
  }

  if (command === "region") {
    return message.reply({
      embeds: [
        embed(
          "🌎 Región",
          "Discord administra actualmente la región automáticamente."
        )
      ]
    });
  }

  if (command === "rolescount") {
    return message.reply({
      embeds: [
        embed(
          "🎭 Roles",
          `Hay **${message.guild.roles.cache.size} roles**.`
        )
      ]
    });
  }

  if (command === "channelcount") {
    return message.reply({
      embeds: [
        embed(
          "📁 Canales",
          `Hay **${message.guild.channels.cache.size} canales**.`
        )
      ]
    });
  }

  // ========================================================
  // 🎮 DIVERSIÓN
  // ========================================================

  if (command === "8ball") {
    const answers = [
      "✨ Sí.",
      "🌸 Definitivamente.",
      "🤔 Probablemente.",
      "❌ No.",
      "🌙 No parece probable.",
      "🎀 Pregunta más tarde.",
      "⭐ Las estrellas dicen que sí."
    ];

    return message.reply({
      embeds: [
        embed(
          "🎱 8Ball",
          answers[Math.floor(Math.random() * answers.length)]
        )
      ]
    });
  }

  if (command === "coinflip") {
    return message.reply({
      embeds: [
        embed(
          "🪙 Cara o cruz",
          Math.random() < 0.5 ? "🪙 **Cara**" : "🪙 **Cruz**"
        )
      ]
    });
  }

  if (command === "dice") {
    const number =
      Math.floor(Math.random() * 6) + 1;

    return message.reply({
      embeds: [
        embed("🎲 Dado", `Resultado: **${number}**`)
      ]
    });
  }

  if (command === "roll") {
    const number =
      Math.floor(Math.random() * 100) + 1;

    return message.reply({
      embeds: [
        embed("🎲 Roll", `Resultado: **${number}**`)
      ]
    });
  }

  if (command === "choose") {
    const choices = args.join(" ").split("|");

    if (choices.length < 2) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Uso: \`${PREFIX}choose pizza | hamburguesa\``
          )
        ]
      });
    }

    const choice =
      choices[Math.floor(Math.random() * choices.length)].trim();

    return message.reply({
      embeds: [
        embed("🎯 Elección", `Madokami eligió: **${choice}**`)
      ]
    });
  }

  if (command === "joke") {
    const jokes = [
      "😂 ¿Qué hace una abeja en el gimnasio? ¡Zum-ba!",
      "😂 ¿Qué le dijo un pez a otro? Nada.",
      "😂 ¿Por qué el libro fue al médico? Porque tenía muchas páginas en blanco."
    ];

    return message.reply({
      embeds: [
        embed(
          "😂 Chiste",
          jokes[Math.floor(Math.random() * jokes.length)]
        )
      ]
    });
  }

  if (command === "hug") {
    const target = message.mentions.users.first();

    return message.reply({
      embeds: [
        embed(
          "🤗 Abrazo",
          target
            ? `${message.author} le da un abrazo a ${target}. 🌸`
            : `${message.author} recibe un abrazo de Madokami. 🌸`
        )
      ]
    });
  }

  if (command === "pat") {
    const target = message.mentions.users.first();

    return message.reply({
      embeds: [
        embed(
          "🫳 Pat",
          target
            ? `${message.author} le da unas palmaditas a ${target}. 🌸`
            : `${message.author} recibe unas palmaditas. 🌸`
        )
      ]
    });
  }

  if (command === "trivia") {
    const questions = [
      ["¿Cuál es el planeta más grande?", ["Júpiter", "Marte", "Venus"], "Júpiter"],
      ["¿Cuántos lados tiene un hexágono?", ["5", "6", "8"], "6"],
      ["¿Cuál es el océano más grande?", ["Atlántico", "Pacífico", "Índico"], "Pacífico"]
    ];

    const q =
      questions[Math.floor(Math.random() * questions.length)];

    return message.reply({
      embeds: [
        embed(
          "🧠 Trivia",
          `**${q[0]}**\n\n${q[1].map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nRespuesta: **${q[2]}**`
        )
      ]
    });
  }

  if (command === "guess") {
    const number =
      Math.floor(Math.random() * 10) + 1;

    return message.reply({
      embeds: [
        embed(
          "🎯 Guess",
          `Estoy pensando en un número del **1 al 10**.\nMi número era: **${number}**.`
        )
      ]
    });
  }

  if (command === "random") {
    return message.reply({
      embeds: [
        embed(
          "🎲 Random",
          `Número aleatorio: **${Math.floor(Math.random() * 1000) + 1}**`
        )
      ]
    });
  }

  if (command === "rate") {
    const number =
      Math.floor(Math.random() * 101);

    return message.reply({
      embeds: [
        embed(
          "⭐ Rate",
          `Madokami te da un **${number}/100**.`
        )
      ]
    });
  }

  if (command === "magic") {
    return message.reply({
      embeds: [
        embed(
          "✨ Magia",
          "🌸 *Madokami ha utilizado magia misteriosa...*"
        )
      ]
    });
  }

  if (command === "fortune") {
    const fortunes = [
      "🌸 Hoy será un buen día.",
      "⭐ Algo interesante está por ocurrir.",
      "🌙 Ten paciencia.",
      "✨ Una sorpresa podría aparecer."
    ];

    return message.reply({
      embeds: [
        embed(
          "🔮 Fortuna",
          fortunes[Math.floor(Math.random() * fortunes.length)]
        )
      ]
    });
  }

  // ========================================================
  // 💗 SOCIAL
  // ========================================================

  if (command === "profile") {
    return message.reply({
      embeds: [
        embed(
          "💗 Perfil",
          `👤 ${message.author}\n` +
          `💰 Dinero: **${user.wallet}**\n` +
          `⭐ Nivel: **${user.level}**\n` +
          `✨ XP: **${user.xp}**`
        )
      ]
    });
  }

  if (command === "level") {
    return message.reply({
      embeds: [
        embed(
          "⭐ Nivel",
          `${message.author} está en el nivel **${user.level}** con **${user.xp} XP**.`
        )
      ]
    });
  }

  if (command === "rank") {
    return message.reply({
      embeds: [
        embed(
          "🏆 Rank",
          `${message.author}\n⭐ Nivel **${user.level}**\n✨ XP **${user.xp}**`
        )
      ]
    });
  }

  if (command === "ship") {
    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}ship @usuario\``)
        ]
      });
    }

    const percentage =
      Math.floor(Math.random() * 101);

    return message.reply({
      embeds: [
        embed(
          "💗 Ship",
          `${message.author} + ${target}\n\n💗 Compatibilidad: **${percentage}%**`
        )
      ]
    });
  }

  if (command === "social") {
    return message.reply({
      embeds: [
        embed(
          "💗 Social",
          `Tu perfil está disponible con \`${PREFIX}profile\`.`
        )
      ]
    });
  }

  if (command === "say") {
    const text = args.join(" ");

    if (!text) {
      return message.reply({
        embeds: [
          errorEmbed("Escribe algo.")
        ]
      });
    }

    return message.reply({
      embeds: [
        embed("💬 Madokami dice", text.slice(0, 4000))
      ]
    });
  }

  if (command === "whois") {
    const target =
      message.mentions.users.first() || message.author;

    return message.reply({
      embeds: [
        embed(
          "👤 WhoIs",
          `Usuario: ${target}\nID: \`${target.id}\``
        )
      ]
    });
  }

  if (command === "hello") {
    return message.reply({
      embeds: [
        embed(
          "🌸 Hola",
          `¡Hola ${message.author}! 💗`
        )
      ]
    });
  }

  if (command === "goodnight") {
    return message.reply({
      embeds: [
        embed(
          "🌙 Buenas noches",
          `Que descanses, ${message.author}. 🌸`
        )
      ]
    });
  }

  if (command === "goodmorning") {
    return message.reply({
      embeds: [
        embed(
          "☀️ Buenos días",
          `¡Buenos días, ${message.author}! 🌸`
        )
      ]
    });
  }

  if (command === "love") {
    return message.reply({
      embeds: [
        embed(
          "💗 Love",
          "Madokami envía buena energía. 🌸"
        )
      ]
    });
  }

  if (command === "highfive") {
    const target = message.mentions.users.first();

    return message.reply({
      embeds: [
        embed(
          "🖐️ High Five",
          `${message.author} choca los cinco con ${target || "Madokami"}.`
        )
      ]
    });
  }

  if (command === "wave") {
    return message.reply({
      embeds: [
        embed(
          "👋 Wave",
          `${message.author} saluda a todos. 🌸`
        )
      ]
    });
  }

  if (command === "clap") {
    return message.reply({
      embeds: [
        embed(
          "👏 Clap",
          `${message.author} está aplaudiendo.`
        )
      ]
    });
  }

  if (command === "smile") {
    return message.reply({
      embeds: [
        embed(
          "😊 Smile",
          `${message.author} está sonriendo.`
        )
      ]
    });
  }

  // ========================================================
  // ⭐ NIVELES
  // ========================================================

  if (command === "levels") {
    const list = Object.entries(guild.users)
      .sort((a, b) => {
        if (b[1].level !== a[1].level)
          return b[1].level - a[1].level;

        return b[1].xp - a[1].xp;
      })
      .slice(0, 10);

    let text = "";

    list.forEach(([id, data], i) => {
      text += `**${i + 1}.** <@${id}> — ⭐ Nivel ${data.level} (${data.xp} XP)\n`;
    });

    return message.reply({
      embeds: [
        embed(
          "🏆 Tabla de niveles",
          text || "Todavía no hay niveles registrados."
        )
      ]
    });
  }

  if (command === "xp") {
    return message.reply({
      embeds: [
        embed(
          "✨ XP",
          `Tienes **${user.xp} XP**.`
        )
      ]
    });
  }

  if (command === "levelup") {
    return message.reply({
      embeds: [
        embed(
          "⭐ Progreso",
          `Nivel actual: **${user.level}**\nXP: **${user.xp}/${user.level * 100}**`
        )
      ]
    });
  }

  if (command === "leaderboard") {
    const list = Object.entries(guild.users)
      .sort((a, b) => b[1].level - a[1].level)
      .slice(0, 10);

    let text = "";

    list.forEach(([id, data], i) => {
      text += `${i + 1}. <@${id}> — Nivel ${data.level}\n`;
    });

    return message.reply({
      embeds: [
        embed("🏆 Leaderboard", text || "Sin datos.")
      ]
    });
  }

  if (command === "myrank") {
    const sorted = Object.entries(guild.users)
      .sort((a, b) => b[1].level - a[1].level);

    const position =
      sorted.findIndex(([id]) => id === message.author.id) + 1;

    return message.reply({
      embeds: [
        embed(
          "🏆 Tu posición",
          `Estás en la posición **#${position || "?"}**.`
        )
      ]
    });
  }

  if (command === "nextlevel") {
    return message.reply({
      embeds: [
        embed(
          "⭐ Siguiente nivel",
          `Te faltan **${Math.max(0, user.level * 100 - user.xp)} XP**.`
        )
      ]
    });
  }

  if (command === "levelinfo") {
    return message.reply({
      embeds: [
        embed(
          "⭐ Información de nivel",
          `Nivel: **${user.level}**\nXP: **${user.xp}**\nNecesario: **${user.level * 100} XP**`
        )
      ]
    });
  }

  if (command === "topxp") {
    const list = Object.entries(guild.users)
      .sort((a, b) => b[1].xp - a[1].xp)
      .slice(0, 10);

    let text = "";

    list.forEach(([id, data], i) => {
      text += `${i + 1}. <@${id}> — ${data.xp} XP\n`;
    });

    return message.reply({
      embeds: [
        embed("✨ Top XP", text || "Sin datos.")
      ]
    });
  }

  if (command === "addxp") {
    if (!isAdmin(message)) {
      return message.reply({
        embeds: [
          errorEmbed("❌ Solo administradores.")
        ]
      });
    }

    const target = message.mentions.users.first();
    const amount = Number(args[1]);

    if (!target || !amount || amount <= 0) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}addxp @usuario cantidad\``)
        ]
      });
    }

    addXP(message.guild.id, target.id, amount);

    return message.reply({
      embeds: [
        successEmbed(
          `✨ Se añadieron **${amount} XP** a ${target}.`
        )
      ]
    });
  }

  if (command === "resetxp") {
    if (!isAdmin(message)) {
      return message.reply({
        embeds: [
          errorEmbed("❌ Solo administradores.")
        ]
      });
    }

    const target = message.mentions.users.first();

    if (!target) return;

    const targetData = getUser(
      message.guild.id,
      target.id
    );

    targetData.xp = 0;
    targetData.level = 1;

    saveDB();

    return message.reply({
      embeds: [
        successEmbed(
          `🔄 XP de ${target} reiniciada.`
        )
      ]
    });
  }

  if (command === "setlevel") {
    if (!isAdmin(message)) return;

    const target = message.mentions.users.first();
    const level = Number(args[1]);

    if (!target || !level || level < 1) return;

    const targetData = getUser(
      message.guild.id,
      target.id
    );

    targetData.level = level;
    saveDB();

    return message.reply({
      embeds: [
        successEmbed(
          `⭐ Nivel de ${target} establecido en **${level}**.`
        )
      ]
    });
  }

  if (command === "levelreset") {
    if (!isAdmin(message)) return;

    guild.users = {};

    saveDB();

    return message.reply({
      embeds: [
        successEmbed("🔄 Niveles reiniciados.")
      ]
    });
  }

  if (command === "levelon") {
    return message.reply({
      embeds: [
        successEmbed("⭐ El sistema de niveles está activo.")
      ]
    });
  }

  if (command === "leveloff") {
    return message.reply({
      embeds: [
        successEmbed(
          "⭐ El sistema de niveles está integrado en Madokami."
        )
      ]
    });
  }

  // ========================================================
  // 🛠️ UTILIDADES
  // ========================================================

  if (command === "ping") {
    return message.reply({
      embeds: [
        embed(
          "🏓 Ping",
          `Latencia: **${client.ws.ping}ms**`
        )
      ]
    });
  }

  if (command === "poll") {
    const question = args.join(" ");

    if (!question) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Uso: \`${PREFIX}poll pregunta\``
          )
        ]
      });
    }

    const msg = await message.channel.send({
      embeds: [
        embed(
          "📊 Encuesta",
          `**${question}**\n\n👍 Sí\n👎 No`
        )
      ]
    });

    await msg.react("👍").catch(() => {});
    await msg.react("👎").catch(() => {});

    return;
  }

  if (command === "remind") {
    const seconds = Number(args.shift());
    const text = args.join(" ");

    if (!seconds || !text || seconds > 86400) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Uso: \`${PREFIX}remind segundos mensaje\`\nMáximo: 86400 segundos.`
          )
        ]
      });
    }

    await message.reply({
      embeds: [
        successEmbed(
          `⏰ Recordatorio creado para dentro de **${seconds} segundos**.`
        )
      ]
    });

    setTimeout(() => {
      message.author.send({
        embeds: [
          embed(
            "⏰ Recordatorio",
            text
          )
        ]
      }).catch(() => {});
    }, seconds * 1000);

    return;
  }

  if (command === "time") {
    return message.reply({
      embeds: [
        embed(
          "🕐 Hora",
          `<t:${Math.floor(Date.now() / 1000)}:F>`
        )
      ]
    });
  }

  if (command === "timestamp") {
    return message.reply({
      embeds: [
        embed(
          "⏱️ Timestamp",
          `\`${Math.floor(Date.now() / 1000)}\``
        )
      ]
    });
  }

  if (command === "botinfo") {
    return message.reply({
      embeds: [
        embed(
          "🤖 Madokami",
          `🌸 Bot: **Madokami**\n` +
          `⌨️ Prefix: \`${PREFIX}\`\n` +
          `🏠 Servidores: **${client.guilds.cache.size}**\n` +
          `👥 Usuarios: **${client.users.cache.size}**`
        )
      ]
    });
  }

  if (command === "invite") {
    const url =
      `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

    return message.reply({
      embeds: [
        embed(
          "🔗 Invitar Madokami",
          `[Haz clic aquí para invitar a Madokami](${url})`
        )
      ]
    });
  }

  if (command === "support") {
    return message.reply({
      embeds: [
        embed(
          "💬 Soporte",
          "Si necesitas ayuda con Madokami, contacta con el equipo del servidor."
        )
      ]
    });
  }

  if (command === "embed") {
    if (!isAdmin(message)) return;

    const text = args.join(" ");

    if (!text) return;

    return message.channel.send({
      embeds: [
        embed("🌸 Madokami Embed", text)
      ]
    });
  }

  if (command === "sayembed") {
    const text = args.join(" ");

    if (!text) return;

    return message.reply({
      embeds: [
        embed("💬 Mensaje", text)
      ]
    });
  }

  // ========================================================
  // 🌸 MADOKAMI
  // ========================================================

  if (command === "about") {
    return message.reply({
      embeds: [
        embed(
          "🌸 Sobre Madokami",
          "Madokami es un bot multifunción para administrar y entretener tu servidor."
        )
      ]
    });
  }

  if (command === "prefix") {
    return message.reply({
      embeds: [
        embed(
          "⌨️ Prefix",
          `El prefix actual es \`${PREFIX}\`.`
        )
      ]
    });
  }

  if (command === "commands") {
    return message.reply({
      embeds: [
        embed(
          "📚 Comandos",
          `Usa \`${PREFIX}help\` para abrir el menú completo.`
        )
      ]
    });
  }

  if (command === "status") {
    return message.reply({
      embeds: [
        embed(
          "📊 Estado",
          `🟢 Madokami está funcionando correctamente.\n🏠 Servidores: **${client.guilds.cache.size}**`
        )
      ]
    });
  }

  if (command === "server") {
    return message.reply({
      embeds: [
        embed(
          "🌸 Servidor",
          `Estás en **${message.guild.name}**.`
        )
      ]
    });
  }

  if (command === "bot") {
    return message.reply({
      embeds: [
        embed(
          "🤖 Bot",
          `Madokami está conectado como **${client.user.tag}**.`
        )
      ]
    });
  }

  if (command === "hello") {
    return message.reply({
      embeds: [
        embed(
          "🌸 Madokami",
          `¡Hola ${message.author}!`
        )
      ]
    });
  }

  if (command === "version") {
    return message.reply({
      embeds: [
        embed(
          "📦 Versión",
          "Madokami v1.0.0"
        )
      ]
    });
  }

  if (command === "statusbot") {
    return message.reply({
      embeds: [
        successEmbed("🟢 Todos los sistemas principales están activos.")
      ]
    });
  }

  if (command === "uptime") {
    const seconds = Math.floor(process.uptime());

    return message.reply({
      embeds: [
        embed(
          "⏱️ Uptime",
          `Madokami lleva **${seconds} segundos** activo.`
        )
      ]
    });
  }

  if (command === "stats") {
    return message.reply({
      embeds: [
        embed(
          "📊 Estadísticas",
          `🏠 Servidores: **${client.guilds.cache.size}**\n` +
          `👥 Usuarios: **${client.users.cache.size}**\n` +
          `📡 Ping: **${client.ws.ping}ms**`
        )
      ]
    });
  }

  if (command === "commandsinfo") {
    return message.reply({
      embeds: [
        embed(
          "📚 Información",
          `Hay varias categorías disponibles en \`${PREFIX}help\`.`
        )
      ]
    });
  }

  if (command === "github") {
    return message.reply({
      embeds: [
        embed(
          "💻 GitHub",
          "El código de Madokami se administra desde su repositorio."
        )
      ]
    });
  }

  if (command === "developer") {
    return message.reply({
      embeds: [
        embed(
          "👨‍💻 Developer",
          "Madokami está desarrollado para este servidor."
        )
      ]
    });
  }

  // ========================================================
  // 👑 MODERACIÓN
  // ========================================================

  if (command === "ban") {
    if (!isAdmin(message)) return;

    const target = mentionUser(message);

    if (!target) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}ban @usuario razón\``)
        ]
      });
    }

    const reason =
      args.slice(1).join(" ") || "Sin razón especificada";

    if (!target.bannable) {
      return message.reply({
        embeds: [
          errorEmbed("❌ No puedo banear a ese usuario.")
        ]
      });
    }

    await target.ban({ reason });

    await sendLog(
      message.guild,
      "BAN",
      `👤 Usuario: ${target.user}\n` +
      `🛡️ Moderador: ${message.author}\n` +
      `📝 Razón: ${reason}`,
      0xFF4D6D
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔨 ${target.user} fue baneado.\n📝 Razón: ${reason}`
        )
      ]
    });
  }

  if (command === "unban") {
    if (!isAdmin(message)) return;

    const id = args[0];

    if (!id) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}unban ID\``)
        ]
      });
    }

    try {
      await message.guild.members.unban(id);

      await sendLog(
        message.guild,
        "UNBAN",
        `👤 ID: \`${id}\`\n🛡️ Moderador: ${message.author}`,
        0xB8F2E6
      );

      return message.reply({
        embeds: [
          successEmbed(`🔓 Usuario \`${id}\` desbaneado.`)
        ]
      });
    } catch {
      return message.reply({
        embeds: [
          errorEmbed("❌ No se pudo quitar el ban.")
        ]
      });
    }
  }

  if (command === "kick") {
    if (!isAdmin(message)) return;

    const target = mentionUser(message);

    if (!target || !target.kickable) {
      return message.reply({
        embeds: [
          errorEmbed("❌ No puedo expulsar a ese usuario.")
        ]
      });
    }

    const reason =
      args.slice(1).join(" ") || "Sin razón";

    await target.kick(reason);

    await sendLog(
      message.guild,
      "KICK",
      `👤 Usuario: ${target.user}\n🛡️ Moderador: ${message.author}\n📝 Razón: ${reason}`,
      0xFF8FA3
    );

    return message.reply({
      embeds: [
        successEmbed(
          `👢 ${target.user} fue expulsado.`
        )
      ]
    });
  }

  if (command === "mute") {
    if (!isAdmin(message)) return;

    const target = mentionUser(message);

    if (!target || !target.moderatable) {
      return message.reply({
        embeds: [
          errorEmbed("❌ No puedo silenciar a ese usuario.")
        ]
      });
    }

    await target.timeout(
      2 * 60 * 60 * 1000,
      "Madokami mute"
    );

    await sendLog(
      message.guild,
      "MUTE",
      `👤 Usuario: ${target.user}\n🛡️ Moderador: ${message.author}\n⏱️ Duración: **2 horas**`,
      0xFFB703
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔇 ${target.user} ha sido silenciado durante **2 horas**.`
        )
      ]
    });
  }

  if (command === "unmute") {
    if (!isAdmin(message)) return;

    const target = mentionUser(message);

    if (!target) return;

    await target.timeout(null, "Madokami unmute");

    await sendLog(
      message.guild,
      "UNMUTE",
      `👤 Usuario: ${target.user}\n🛡️ Moderador: ${message.author}`,
      0xB8F2E6
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔊 ${target.user} ya no está silenciado.`
        )
      ]
    });
  }

  if (command === "warn") {
    if (!isAdmin(message)) return;

    const target = message.mentions.users.first();

    if (!target) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}warn @usuario razón\``)
        ]
      });
    }

    const reason =
      args.slice(1).join(" ") || "Sin razón";

    if (!guild.warns[target.id]) {
      guild.warns[target.id] = [];
    }

    guild.warns[target.id].push({
      reason,
      moderator: message.author.id,
      timestamp: Date.now()
    });

    saveDB();

    await sendLog(
      message.guild,
      "WARN",
      `👤 Usuario: ${target}\n` +
      `🛡️ Moderador: ${message.author}\n` +
      `📝 Razón: ${reason}\n` +
      `⚠️ Total: **${guild.warns[target.id].length}**`,
      0xFFD166
    );

    return message.reply({
      embeds: [
        successEmbed(
          `⚠️ ${target} recibió un warn.\n📝 Razón: ${reason}`
        )
      ]
    });
  }

  if (command === "warnings" || command === "warns") {
    const target =
      message.mentions.users.first() || message.author;

    const warns = guild.warns[target.id] || [];

    if (!warns.length) {
      return message.reply({
        embeds: [
          embed(
            "⚠️ Warns",
            `${target} no tiene warns.`
          )
        ]
      });
    }

    const text = warns
      .map(
        (w, i) =>
          `**${i + 1}.** ${w.reason}\n> <@${w.moderator}> • <t:${Math.floor(w.timestamp / 1000)}:R>`
      )
      .join("\n\n");

    return message.reply({
      embeds: [
        embed(
          `⚠️ Warns de ${target.username}`,
          text
        )
      ]
    });
  }

  if (command === "clear") {
    if (!isAdmin(message)) return;

    const amount = Number(args[0]);

    if (!amount || amount < 1 || amount > 100) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Usa una cantidad entre **1 y 100**.`
          )
        ]
      });
    }

    const deleted =
      await message.channel.bulkDelete(amount, true);

    await sendLog(
      message.guild,
      "CLEAR",
      `🧹 Mensajes eliminados: **${deleted.size}**\n` +
      `📍 Canal: ${message.channel}\n` +
      `🛡️ Moderador: ${message.author}`,
      0xFF6B6B
    );

    return message.channel.send({
      embeds: [
        successEmbed(
          `🧹 Se eliminaron **${deleted.size} mensajes**.`
        )
      ]
    }).then(msg => {
      setTimeout(() => msg.delete().catch(() => {}), 5000);
    });
  }

  if (command === "slowmode") {
    if (!isAdmin(message)) return;

    const seconds = Number(args[0]);

    if (
      Number.isNaN(seconds) ||
      seconds < 0 ||
      seconds > 21600
    ) {
      return message.reply({
        embeds: [
          errorEmbed(
            "El slowmode debe estar entre 0 y 21600 segundos."
          )
        ]
      });
    }

    await message.channel.setRateLimitPerUser(seconds);

    await sendLog(
      message.guild,
      "SLOWMODE MODIFICADO",
      `📍 Canal: ${message.channel}\n` +
      `⏱️ Nuevo valor: **${seconds} segundos**\n` +
      `🛡️ Moderador: ${message.author}`,
      0xFFD166
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🐌 Slowmode establecido en **${seconds}s**.`
        )
      ]
    });
  }

  if (command === "lock") {
    if (!isAdmin(message)) return;

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: false
      }
    );

    await sendLog(
      message.guild,
      "CANAL BLOQUEADO",
      `📍 Canal: ${message.channel}\n🛡️ Moderador: ${message.author}`,
      0xFF6B6B
    );

    return message.reply({
      embeds: [
        successEmbed("🔒 Canal bloqueado.")
      ]
    });
  }

  if (command === "unlock") {
    if (!isAdmin(message)) return;

    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      {
        SendMessages: null
      }
    );

    await sendLog(
      message.guild,
      "CANAL DESBLOQUEADO",
      `📍 Canal: ${message.channel}\n🛡️ Moderador: ${message.author}`,
      0xB8F2E6
    );

    return message.reply({
      embeds: [
        successEmbed("🔓 Canal desbloqueado.")
      ]
    });
  }

  // ========================================================
  // 🛡️ SEGURIDAD
  // ========================================================

  if (command === "antilink") {
    if (!isAdmin(message)) return;

    const option = args[0]?.toLowerCase();

    if (!["on", "off"].includes(option)) {
      return message.reply({
        embeds: [
          errorEmbed(`Usa \`${PREFIX}antilink on\` o \`${PREFIX}antilink off\`.`)
        ]
      });
    }

    guild.config.antiLink = option === "on";
    saveDB();

    await sendLog(
      message.guild,
      "ANTI-LINK MODIFICADO",
      `🛡️ Estado: **${option.toUpperCase()}**\n` +
      `👤 Modificado por: ${message.author}`,
      0xE8A7FF
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🔗 Anti-Link: **${option === "on" ? "ACTIVADO" : "DESACTIVADO"}**`
        )
      ]
    });
  }

  if (command === "antispam") {
    if (!isAdmin(message)) return;

    const option = args[0]?.toLowerCase();

    if (!["on", "off"].includes(option)) {
      return message.reply({
        embeds: [
          errorEmbed(`Usa \`${PREFIX}antispam on\` o \`${PREFIX}antispam off\`.`)
        ]
      });
    }

    guild.config.antiSpam = option === "on";
    saveDB();

    await sendLog(
      message.guild,
      "ANTI-SPAM MODIFICADO",
      `🚨 Estado: **${option.toUpperCase()}**\n` +
      `👤 Modificado por: ${message.author}`,
      0xFFB703
    );

    return message.reply({
      embeds: [
        successEmbed(
          `🚨 Anti-Spam: **${option === "on" ? "ACTIVADO" : "DESACTIVADO"}**`
        )
      ]
    });
  }

  // ========================================================
  // 📜 LOG CONFIG
  // ========================================================

  if (command === "log") {
    if (!isAdmin(message)) return;

    if (args[0]?.toLowerCase() === "off") {
      guild.config.logChannel = null;
      saveDB();

      return message.reply({
        embeds: [
          successEmbed("📜 Sistema de logs desactivado.")
        ]
      });
    }

    const channel =
      message.mentions.channels.first();

    if (!channel || !channel.isTextBased()) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Uso: \`${PREFIX}log #canal\`\nO \`${PREFIX}log off\``
          )
        ]
      });
    }

    guild.config.logChannel = channel.id;
    saveDB();

    await sendLog(
      message.guild,
      "SISTEMA DE LOGS",
      `📜 Canal configurado correctamente.\n` +
      `📍 Canal: ${channel}\n` +
      `🛡️ Configurado por: ${message.author}`,
      0xE8A7FF
    );

    return message.reply({
      embeds: [
        successEmbed(
          `📜 Los logs ahora se enviarán a ${channel}.`
        )
      ]
    });
  }

  // ========================================================
  // 👋 WELCOME
  // ========================================================

  if (command === "welcome") {
    if (!isAdmin(message)) return;

    const option = args[0]?.toLowerCase();

    if (!["on", "off"].includes(option)) {
      return message.reply({
        embeds: [
          errorEmbed(
            `Usa \`${PREFIX}welcome on\` o \`${PREFIX}welcome off\`.`
          )
        ]
      });
    }

    guild.config.welcome = option === "on";
    saveDB();

    return message.reply({
      embeds: [
        successEmbed(
          `👋 Welcome **${option === "on" ? "activado" : "desactivado"}**.`
        )
      ]
    });
  }

  if (command === "autorole") {
    if (!isAdmin(message)) return;

    const role = message.mentions.roles.first();

    if (!role) {
      return message.reply({
        embeds: [
          errorEmbed(`Uso: \`${PREFIX}autorole @rol\``)
        ]
      });
    }

    guild.config.autoRole = role.id;
    saveDB();

    return message.reply({
      embeds: [
        successEmbed(
          `🎭 AutoRole configurado: ${role}`
        )
      ]
    });
  }

  // ========================================================
  // ❓ COMANDO DESCONOCIDO
  // ========================================================

  return message.reply({
    embeds: [
      errorEmbed(
        `❌ Ese comando no existe.\n\nUsa \`${PREFIX}help\` para ver los comandos.`
      )
    ]
  });
});

// ============================================================
// 🎛️ MENÚS
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId !== "madokami_help") return;

  const category = interaction.values[0];

  const menus = {

    economia: [
      "balance", "work", "risk", "crime", "pay",
      "daily", "deposit", "withdraw", "richest",
      "give", "money", "economy", "profile", "rank", "leaderboard"
    ],

    info: [
      "userinfo", "serverinfo", "avatar", "id", "roles",
      "channels", "members", "icon", "created", "owner",
      "boost", "region", "rolescount", "channelcount", "botinfo"
    ],

    diversion: [
      "8ball", "coinflip", "dice", "roll", "choose",
      "joke", "hug", "pat", "trivia", "guess",
      "random", "rate", "magic", "fortune", "hello"
    ],

    social: [
      "profile", "level", "rank", "ship", "social",
      "say", "whois", "hello", "goodnight", "goodmorning",
      "love", "highfive", "wave", "clap", "smile"
    ],

    niveles: [
      "level", "rank", "levels", "xp", "levelup",
      "leaderboard", "myrank", "nextlevel", "levelinfo",
      "topxp", "profile", "addxp", "resetxp",
      "setlevel", "levelreset"
    ],

    utilidades: [
      "ping", "poll", "remind", "time", "timestamp",
      "botinfo", "invite", "support", "embed", "sayembed",
      "serverinfo", "userinfo", "avatar", "channels", "roles"
    ],

    madokami: [
      "about", "prefix", "commands", "status", "server",
      "bot", "hello", "version", "statusbot", "uptime",
      "stats", "commandsinfo", "github", "developer", "support"
    ]
  };

  const names = {
    balance: "💰 balance",
    work: "💼 work",
    risk: "🎲 risk",
    crime: "🚨 crime",
    pay: "💸 pay",
    daily: "🎁 daily",
    deposit: "🏦 deposit",
    withdraw: "💵 withdraw",
    richest: "👑 richest",
    give: "🎁 give",
    money: "💰 money",
    economy: "💰 economy",
    profile: "💗 profile",
    rank: "🏆 rank",
    leaderboard: "🏆 leaderboard",
    userinfo: "👤 userinfo",
    serverinfo: "🏠 serverinfo",
    avatar: "🖼️ avatar",
    id: "🆔 id",
    roles: "🎭 roles",
    channels: "📁 channels",
    members: "👥 members",
    icon: "🖼️ icon",
    created: "📅 created",
    owner: "👑 owner",
    boost: "🚀 boost",
    region: "🌎 region",
    rolescount: "🎭 rolescount",
    channelcount: "📁 channelcount",
    botinfo: "🤖 botinfo",
    "8ball": "🎱 8ball",
    coinflip: "🪙 coinflip",
    dice: "🎲 dice",
    roll: "🎲 roll",
    choose: "🎯 choose",
    joke: "😂 joke",
    hug: "🤗 hug",
    pat: "🫳 pat",
    trivia: "🧠 trivia",
    guess: "🎯 guess",
    random: "🎲 random",
    rate: "⭐ rate",
    magic: "✨ magic",
    fortune: "🔮 fortune",
    level: "⭐ level",
    levels: "🏆 levels",
    xp: "✨ xp",
    levelup: "⭐ levelup",
    myrank: "🏆 myrank",
    nextlevel: "⭐ nextlevel",
    levelinfo: "⭐ levelinfo",
    topxp: "✨ topxp",
    addxp: "✨ addxp",
    resetxp: "🔄 resetxp",
    setlevel: "⭐ setlevel",
    levelreset: "🔄 levelreset",
    social: "💗 social",
    say: "💬 say",
    whois: "👤 whois",
    goodnight: "🌙 goodnight",
    goodmorning: "☀️ goodmorning",
    love: "💗 love",
    highfive: "🖐️ highfive",
    wave: "👋 wave",
    clap: "👏 clap",
    smile: "😊 smile",
    ping: "🏓 ping",
    poll: "📊 poll",
    remind: "⏰ remind",
    time: "🕐 time",
    timestamp: "⏱️ timestamp",
    invite: "🔗 invite",
    support: "💬 support",
    embed: "🌸 embed",
    sayembed: "💬 sayembed",
    about: "🌸 about",
    prefix: "⌨️ prefix",
    commands: "📚 commands",
    status: "📊 status",
    server: "🏠 server",
    bot: "🤖 bot",
    hello: "🌸 hello",
    version: "📦 version",
    statusbot: "🟢 statusbot",
    uptime: "⏱️ uptime",
    stats: "📊 stats",
    commandsinfo: "📚 commandsinfo",
    github: "💻 github",
    developer: "👨‍💻 developer"
  };

  const descriptions = menus[category]
    .map(cmd => `\`${PREFIX}${cmd}\` — ${names[cmd] || cmd}`)
    .join("\n");

  await interaction.reply({
    embeds: [
      embed(
        `🌸 ${category.toUpperCase()}`,
        `Aquí tienes **15 comandos**:\n\n${descriptions}`
      )
    ],
    ephemeral: true
  });
});

// ============================================================
// 🌐 SERVIDOR HTTP PARA RENDER
// ============================================================

http.createServer((req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/plain"
  });

  res.end("🌸 Madokami está funcionando correctamente.");
}).listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Puerto ${PORT} activo.`);
});

// ============================================================
// 🔑 LOGIN
// ============================================================

if (!process.env.DISCORD_TOKEN) {
  console.error("❌ Falta DISCORD_TOKEN en las variables de entorno.");
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
