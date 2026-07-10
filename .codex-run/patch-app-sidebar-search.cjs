const fs = require('fs');
const path = 'src/App.svelte';
let text = fs.readFileSync(path, 'utf8');
if (!text.includes('onOpenConversationSearch={openSidebarConversationSearch}')) {
  const regex = /(\s+onOpenMessageResult=\{openMessageResult\}\r?\n)(\s+onRefreshPeers=\{refreshPeers\})/;
  if (!regex.test(text)) throw new Error('ConversationList prop anchor not found');
  text = text.replace(regex, '$1      onOpenConversationSearch={openSidebarConversationSearch}\r\n$2');
}
fs.writeFileSync(path, text, 'utf8');
