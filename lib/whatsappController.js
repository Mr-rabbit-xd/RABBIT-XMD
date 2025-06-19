const config = require('../config');

// ✅ STATUS AUTOMATION
async function whatsappAutomation(sock, msg, messageType) {
    const senderID = sock?.user?.id?.split(':')[0];
    const fromSender = msg?.sender;
    const fromUser = msg?.key?.remoteJid;
    const isStatus = fromUser === 'status@broadcast';
    const participant = msg?.key?.participant;

    // 
    if (config.AUTO_STATUS_VIEW && isStatus && participant) {
        try {
            await sock.readMessages([msg.key]);
        } catch (err) {}

        // 
        if (config.STATUS_REACTION) {
            const emojiList = config.STATUS_REACTION_EMOJI.split(',');
            const emoji = emojiList[Math.floor(Math.random() * emojiList.length)];

            try {
                await sock.sendMessage('status@broadcast', {
                    react: {
                        key: msg.key,
                        text: emoji
                    }
                }, {
                    statusJidList: [participant, sock.user.id].filter(Boolean)
                });
            } catch (e) {}
        }

        // 
        if (config.STATUS_REPLY_MSG) {
            try {
                await sock.sendMessage(participant, {
                    text: config.STATUS_REPLY_MSG
                }, {
                    quoted: msg
                });
            } catch (e) {}
        }
    }
}

// 📵 CALL AUTOMATION
async function callAutomation(sock, callInfo) {
    const callerNumber = callInfo.from?.split('@')[0];

    // 
    if (config.REJECT_CALL && callInfo.type === 'offer' && !config.SUDO.includes(callerNumber)) {
        await sock.rejectCall(callInfo.id, callInfo.from);
        await sock.sendMessage(callInfo.from, {
            text: config.REJECT_CALL_MSG
        });
    }

    // 
    if (config.CALL_BLOCK && callInfo.type === 'offer' && !config.SUDO.includes(callerNumber)) {
        await sock.rejectCall(callInfo.id, callInfo.from);
        await sock.sendMessage(callInfo.from, {
            text: config.CALL_BLOCK_MSG
        });
        await sock.updateBlockStatus(callInfo.from, 'block');
    }
}

// ✨ EXPORT
module.exports = {
    whatsappAutomation,
    callAutomation
};
