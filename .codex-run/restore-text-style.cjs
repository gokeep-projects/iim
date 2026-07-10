const fs = require('fs');
for (const path of ['src/App.svelte', 'src/components/ConversationList.svelte', 'src/styles.css']) {
  let text = fs.readFileSync(path, 'utf8');
  text = text.replace(/^\uFEFF/, '');
  text = text.replace(/\r\n|\r|\n/g, '\r\n');
  fs.writeFileSync(path, '\uFEFF' + text, 'utf8');
}
