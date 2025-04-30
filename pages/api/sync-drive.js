// /pages/api/sync-drive.js
import { notion } from '@/lib/notion'
import { drive } from '@/lib/drive'

const notion = new NotionClient({ auth: process.env.NOTION_API_KEY });
const folderId = process.env.GOOGLE_FOLDER_ID;
const databaseId = process.env.NOTION_DATABASE_ID;

// Token from OAuth Playground or stored service account
const oauth2Client = new google.auth.OAuth2();
oauth2Client.setCredentials({
  access_token: process.env.GOOGLE_ACCESS_TOKEN,
  refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

export default async function handler(req, res) {
  try {
    const { data } = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id, name, createdTime, modifiedTime, mimeType, owners)',
    });

    const files = data.files || [];

    for (const file of files) {
      // Skip if already exists in Notion (optional logic, or use Notion database to track)

      const page = await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          Name: { title: [{ text: { content: file.name } }] },
          Created: { date: { start: file.createdTime } },
          "Last Updated": { date: { start: file.modifiedTime } },
          Owner: {
            rich_text: [
              { text: { content: file.owners?.[0]?.displayName || 'Unknown' } },
            ],
          },
          Type: { select: { name: file.mimeType } },
          Link: {
            url: `https://drive.google.com/file/d/${file.id}/view`,
          },
        },
      });
    }

    res.status(200).json({ message: `Synced ${files.length} files to Notion.` });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
}
