
const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const pino = require('pino');
const { Boom } = require('@hapi/boom');
const { makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, makeInMemoryStore } = require('@whiskeysockets/baileys');
const cron = require('node-cron');
const config = require('./config');
const { serialize, commands, whatsappAutomation, callAutomation, externalPlugins } = require('./lib');

const app = express();
let deployedUrl = '';
const PORT = process.env.PORT || 8000;

// Express base route to get deployed URL
app.get('/', (req, res) => {
  if (!deployedUrl) {
    deployedUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log('Detected Deployed URL:', deployedUrl);
  }
  res.send({ status: 'Active', deployedUrl });
});

// Start Web Check
async function checkWeb() {
  console.log('Web Starting...');
  if (!deployedUrl) {
    console.log('Deployed URL is not yet set.');
    return;
  }
  try {
    const response = await axios.get(deployedUrl);
    console.log('Successfully visited', deployedUrl, '- Status code:', response.status);
  } catch (err) {
    console.error('Error visiting', deployedUrl + ':', err);
  }
}

const server = app.listen(PORT, () => {
  console.log('Connected to Server --', PORT);
  cron.schedule('*/10 * * * * *', checkWeb);
});

// Ensure session folder exists
if (!fs.existsSync('./lib/session')) fs.mkdirSync('./lib/session', { recursive: true });

const store = makeInMemoryStore({ logger: pino({ level: 'silent' }) });

(async () => {
  try {
    // Load session from gist if available
    if (!config.SESSION_ID) throw new Error('Session ID missing');
    const sessionUrl = 'https://gist.github.com/ESWIN-SPERKY/' + config.SESSION_ID.split(':')[1] + '/raw';
    const sessionRes = await axios.get(sessionUrl);
    Object.keys(sessionRes.data).forEach(key => {
      fs.writeFileSync('./lib/session/' + key, sessionRes.data[key], 'utf8');
    });
    console.log('Session connected and session files saved.');
  } catch (err) {
    console.error('Error loading session:', err.message);
  }

  const { state, saveCreds } = await useMultiFileAuthState('./lib/session');
  const sock = makeWASocket({
    auth: state,
    browser: Browsers.macOS('Desktop'),
    logger: pino({ level: 'silent' })
  });

  const jid = (config.SUDO !== '' ? config.SUDO.split(',')[0] : sock.user.id.split(':')[0]) + '@s.whatsapp.net';

  // Scheduled message for updates
  const updateCheck = setInterval(async () => {
    await checkWeb();
    const res = await axios.get('https://api.github.com/repos/aswinsparky/X-BOT-MD/releases');
    let txt = 'X BOT MD UPDATES\n\n';
    res.data.forEach((item, index) => txt += `\n${index + 1}. ${item.name}\n`);
    if (res.data.length > 0) {
      await sock.sendMessage(jid, { text: txt + "\nType 'update now' to update the bot." });
      clearInterval(updateCheck);
    }
  }, 60000);

  store.bind(sock.ev);

  // Sync database
  try {
    await config.DATABASE.sync();
    console.log('Database synced.');
  } catch (err) {
    console.error('Error while syncing database:', err);
  }

  // Load external plugins
  async function loadPlugins() {
    try {
      let plugins = await externalPlugins.findAll();
      plugins.forEach(async plugin => {
        const pluginPath = `./plugins/${plugin.dataValues.name}.js`;
        if (!fs.existsSync(pluginPath)) {
          const res = await axios.get(plugin.dataValues.url);
          if (res.status === 200) {
            console.log('Installing external plugins...');
            fs.writeFileSync(pluginPath, res.data);
            require(pluginPath);
            console.log('External plugins loaded successfully.');
          }
        }
      });
    } catch (err) {
      console.log(err);
    }
  }

  // WhatsApp connection update
  sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
    if (connection === 'open') {
      await loadPlugins();
      console.log('Connected.');

      // Load plugins from folder
      fs.readdirSync('./plugins')
        .filter(file => path.extname(file) === '.js')
        .forEach(file => require('./plugins/' + file));

      // Welcome message with features
      let welcome = `*X BOT MD STARTED!*\n\n` +
        `_Mode: ${config.WORK_TYPE}_\n_Version: ${config.VERSION}_\n_Prefix: ${config.HANDLERS}_\n_Language: ${config.LANGUAGE}_\n\n` +
        `*Extra Configurations*\n\n\`\`\`Always online: ${config.ALWAYS_ONLINE ? '✅' : '❌'}\n` +
        `PM Blocker: ${config.DISABLE_PM ? '✅' : '❌'}\nAuto reject calls: ${config.REJECT_CALLS ? '✅' : '❌'}\n` +
        `Auto status view: ${config.AUTO_STATUS_VIEW ? '✅' : '❌'}\nAuto call blocker: ${config.CALL_BLOCK ? '✅' : '❌'}\n` +
        `Auto status save: ${config.SAVE_STATUS ? '✅' : '❌'}\nAuto status reply: ${config.STATUS_REPLY ? '✅' : '❌'}\n` +
        `Auto status reaction: ${config.STATUS_REACTION ? '✅' : '❌'}\nLogs: ${config.LOGS ? '✅' : '❌'}\nRead messages: ${config.READ_MESSAGES ? '✅' : '❌'}\`\`\``;

      if (config.START_MSG) {
        await sock.sendMessage(jid, {
          text: welcome,
          contextInfo: {
            externalAdReply: {
              title: 'X BOT MD UPDATES',
              body: 'Whatsapp Channel',
              sourceUrl: 'https://whatsapp.com/channel/0029Va9ZOf36rsR1Ym7O2x00',
              mediaUrl: 'https://whatsapp.com/channel/0029Va9ZOf36rsR1Ym7O2x00',
              mediaType: 1,
              showAdAttribution: false,
              renderLargerThumbnail: true,
              thumbnailUrl: 'https://i.imgur.com/Q2UNwXR.jpg'
            }
          }
        });
      }
    } else if (connection === 'close') {
      const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (shouldReconnect === DisconnectReason.connectionReplaced) {
        console.log('Connection replaced. Logout current session first.');
        await sock.logout();
      } else {
        console.log('Reconnecting...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        require('./index.js');
      }
    }
  });

  // Handle new messages
  sock.ev.on('messages.upsert', async msg => {
    let m;
    try {
      m = await serialize(JSON.parse(JSON.stringify(msg.messages[0])), sock);
    } catch (err) {
      console.error('Error serializing message:', err);
      return;
    }

    await whatsappAutomation(sock, m, msg);

    if (!config.READ_MESSAGES && !m.isGroup) return;

    commands.forEach(async cmd => {
      if (cmd.fromMe && !m.fromMe) return;
      let body = m.body ? m.body[0].toLowerCase() + m.body.slice(1).trim() : '';
      if (cmd.on) {
        cmd.on({ m, args: m.body.split(' '), client: sock });
      } else if (cmd.pattern && cmd.pattern.test(body)) {
        const args = body.replace(cmd.pattern, '$1').trim();
        cmd.on({ m, args, client: sock });
      }
    });
  });

  // Save credentials on updates
  sock.ev.on('creds.update', saveCreds);

  // Call handling
  sock.ev.on('call', async calls => {
    for (let call of calls) {
      await callAutomation(sock, call);
    }
  });

  // Catch errors
  process.on('unhandledRejection', async err => {
    console.error('Unhandled error:', err);
    await new Promise(resolve => setTimeout(resolve, 3000));
    require('./index.js');
  });
})();
