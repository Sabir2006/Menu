import { App, MarkdownView, Plugin, Notice, TFile } from 'obsidian';
import fetch from 'node-fetch';

interface AISettings {
  openaiApiKey: string;
  openaiModel: string;
}

export default class AIAgentPlugin extends Plugin {
  settings: AISettings;

  async onload() {
    await this.loadSettings();

    this.addCommand({
      id: 'ai-create-note',
      name: 'AI: создать заметку',
      editorCallback: async (editor, view: MarkdownView) => {
        const prompt = await this.app.prompt('Введите тему заметки:');
        if (!prompt) return;

        const existing = this.searchVault(prompt);
        if (existing.length > 0) {
          new Notice(`Найдено существующее: [[${existing[0].path}]]`);
          return;
        }

        const aiResponse = await this.callOpenAI(prompt);
        if (!aiResponse) {
          new Notice('Ошибка при запросе AI');
          return;
        }

        const [category, tags, content] = this.parseAIOutput(aiResponse);
        await this.createNoteFile(prompt, category, tags, content);
        new Notice(`Заметка по "${prompt}" создана${category ? ' в ' + category : ''}.`);
      }
    });
  }

  searchVault(query: string): TFile[] {
    return this.app.vault.getMarkdownFiles().filter(file => {
      const fname = file.basename.toLowerCase();
      return fname.includes(query.toLowerCase());
    });
  }

  async callOpenAI(theme: string): Promise<string | null> {
    const body = {
      model: this.settings.openaiModel,
      messages: [
        { role: 'user', content: `
Категория:
Теги:
Создай структурированную заметку по теме: "${theme}" в формате:
Категория: <слово>
Теги: #тег1, #тег2
# Заголовок
...текст...
` }
      ]
    };
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.openaiApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content.trim() || null;
  }

  parseAIOutput(text: string): [string, string[], string] {
    const lines = text.split('\n');
    const catLine = lines.find(l => l.startsWith('Категория:'));
    const tagsLine = lines.find(l => l.startsWith('Теги:'));
    let category = catLine ? catLine.replace('Категория:', '').trim() : '';
    const tags = tagsLine
      ? tagsLine.replace('Теги:', '').split(',').map(s => s.trim())
      : [];
    const content = lines.filter(l => !l.startsWith('Категория:') && !l.startsWith('Теги:')).join('\n').trim();
    return [category, tags, content];
  }

  async createNoteFile(name: string, category: string, tags: string[], content: string) {
    const folder = category ? category : '';
    const folderPath = folder;
    let path = folderPath ? `${folder}/${name}.md` : `${name}.md`;
    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
    const tagLine = tags.length ? tags.join(' ') + '\n\n' : '';
    await this.app.vault.create(path, tagLine + content);
  }

  async loadSettings() {
    this.settings = Object.assign({ openaiApiKey: '', openaiModel: 'gpt-4' }, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}