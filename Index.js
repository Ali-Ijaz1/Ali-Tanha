const { default: makeWASocket, useSingleFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@adiwajshing/baileys')
const { Boom } = require('@hapi/boom')
const qrcode = require('qrcode-terminal')
const fs = require('fs-extra')
const express = require('express')
const bodyParser = require('body-parser')

const app = express()
app.use(bodyParser.json())
app.use(express.static('public'))

const PORT = process.env.PORT || 3000

const { state, saveState } = useSingleFileAuthState('./data/session.json')

let settings = {
  botOn: true,
  awayMessage: "⏳ Owner is currently away. Please wait...",
  greetingMessage: "🎉 Welcome to the group!",
  leaveMessage: "👋 Goodbye! Hope to see you again!",
  ownerNumber: "923001234567", // <- isay GUI se bhi editable banayenge
  blockedUsers: [],
  commandPermissions: {
    ".ban": ["owner"],
    ".kick": ["owner", "admin"],
    ".on": ["owner"],
    ".off": ["owner"],
    ".ping": ["owner", "admin"],
    ".b>": ["owner", "admin"],
    ".ub>": ["owner", "admin"],
    ".blist": ["owner", "admin"],
  }
}

let commandList = {
  ".ping": (msg, sock) => {
    sock.sendMessage(msg.key.remoteJid, { text: "📶 Pong!" }, { quoted: msg })
  },
  ".on": (msg, sock) => {
    settings.botOn = true
    sock.sendMessage(msg.key.remoteJid, { text: "✅ Bot is now *ON*." }, { quoted: msg })
  },
  ".off": (msg, sock) => {
    settings.botOn = false
    sock.sendMessage(msg.key.remoteJid, { text: "🚫 Bot is now *OFF*." }, { quoted: msg })
  },
  ".blist": (msg, sock) => {
    let list = settings.blockedUsers.join("\n") || "🚫 No blocked users."
    sock.sendMessage(msg.key.remoteJid, { text: `📄 *Blocked Users:*\n${list}` }, { quoted: msg })
  }
}

function isOwnerOrAdmin(msg, sender) {
  return sender === settings.ownerNumber || msg.key.participant?.includes(settings.ownerNumber)
}

function handleCustomCommands(body, sock) {
  if (body.startsWith(">add command")) {
    // Command parser
    const split = body.split("..")
    if (split.length >= 2) {
      const [cmdLine, action] = split
      const cmd = cmdLine.trim().split(" ")[2]
      commandList[cmd] = (msg, sock) => {
        sock.sendMessage(msg.key.remoteJid, { text: `⚡ Executed: ${action}` }, { quoted: msg })
      }
    }
  }
}

async function startBot() {
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    printQRInTerminal: true,
    auth: state
  })

  sock.ev.on('creds.update', saveState)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update
    if (qr) qrcode.generate(qr, { small: true })

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut
      if (shouldReconnect) {
        console.log('🔁 Reconnecting...')
        startBot()
      }
    } else if (connection === 'open') {
      console.log('✅ Bot connected successfully!')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages }) => {
    const msg = messages[0]
    if (!msg.message || msg.key.fromMe) return

    const sender = msg.key.remoteJid.includes("@g.us") ? msg.key.participant : msg.key.remoteJid
    const body = msg.message.conversation || msg.message.extendedTextMessage?.text

    if (!settings.botOn && !body.startsWith(".on")) return

    if (settings.blockedUsers.includes(sender)) {
      sock.sendMessage(msg.key.remoteJid, { text: "🚫 You are blocked from using this bot." }, { quoted: msg })
      return
    }

    if (body.startsWith(".")) {
      const baseCmd = body.split(" ")[0]
      if (commandList[baseCmd]) {
        if (settings.commandPermissions[baseCmd]?.includes("owner") && sender !== settings.ownerNumber) return
        commandList[baseCmd](msg, sock)
      } else if (body.startsWith(">add command")) {
        handleCustomCommands(body, sock)
        sock.sendMessage(msg.key.remoteJid, { text: "✅ Command added." }, { quoted: msg })
      }
    }
  })
}

app.get('/', (req, res) => {
  res.sendFile(__dirname + "/public/index.html")
})

app.listen(PORT, () => {
  console.log(`🌐 GUI running at http://localhost:${PORT}`)
})

startBot()
