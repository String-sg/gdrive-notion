function syncAll() {
  var GOOGLE_FOLDER_ID = GOOGLE_FOLDER_ID; 
  var NOTION_TOKEN = NOTION_API_KEY;  
  var NOTION_DATABASE_ID = NOTION_DATABASE_ID;   


 // === GET FILES FROM DRIVE FOLDER ===
  var folder = DriveApp.getFolderById(GOOGLE_FOLDER_ID);
  var files = folder.getFiles();
  var driveFiles = {};
  while (files.hasNext()) {
    var file = files.next();
    driveFiles[file.getId()] = file;
  }

  // === FETCH ALL NOTION DATABASE ENTRIES ===
  var notionPages = [];
  var hasMore = true;
  var nextCursor = null;
  while (hasMore) {
    var queryPayload = { page_size: 100 };
    if (nextCursor) queryPayload.start_cursor = nextCursor;

    var options = {
      method: "post",
      contentType: "application/json",
      headers: {
        "Authorization": "Bearer " + NOTION_TOKEN,
        "Notion-Version": "2022-06-28"
      },
      payload: JSON.stringify(queryPayload)
    };
    var response = UrlFetchApp.fetch("https://api.notion.com/v1/databases/" + NOTION_DATABASE_ID + "/query", options);
    var data = JSON.parse(response.getContentText());
    notionPages = notionPages.concat(data.results);
    hasMore = data.has_more;
    nextCursor = data.next_cursor;
  }

  // === MAP NOTION ENTRIES BY FILE ID (from File Link) ===
  var notionByFileId = {};
  var duplicates = {};
  notionPages.forEach(function(page) {
    var fileLink = page.properties["File Link"] && page.properties["File Link"].url;
    var match = fileLink && fileLink.match(/\/d\/([^/]+)\//);
    if (match) {
      var fileId = match[1];
      if (notionByFileId[fileId]) {
        // Duplicate found
        if (!duplicates[fileId]) duplicates[fileId] = [];
        duplicates[fileId].push(page.id);
      } else {
        notionByFileId[fileId] = page.id;
      }
    }
  });

  // === ADD NEW FILES TO NOTION ===
  Object.keys(driveFiles).forEach(function(fileId) {
    if (!notionByFileId[fileId]) {
      var file = driveFiles[fileId];
      var payload = {
        parent: { database_id: NOTION_DATABASE_ID },
        properties: {
          Name: {
            title: [
              { text: { content: file.getName() } }
            ]
          },
          "File Link": {
            url: "https://drive.google.com/file/d/" + file.getId() + "/view"
          },
          "MIME Type": {
            rich_text: [
              { text: { content: file.getMimeType() } }
            ]
          },
          "Created": {
            date: { start: file.getDateCreated().toISOString() }
          },
          "Last Modified": {
            date: { start: file.getLastUpdated().toISOString() }
          },
          "Owner": {
            rich_text: [
              { text: { content: Session.getActiveUser().getEmail() } }
            ]
          }
        }
      };
      var options = {
        method: "post",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + NOTION_TOKEN,
          "Notion-Version": "2022-06-28"
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };
      UrlFetchApp.fetch("https://api.notion.com/v1/pages", options);
    }
  });

  // === REMOVE NOTION ROWS FOR FILES NOT IN DRIVE ===
  Object.keys(notionByFileId).forEach(function(fileId) {
    if (!driveFiles[fileId]) {
      // Delete this Notion page (archive)
      var pageId = notionByFileId[fileId];
      var options = {
        method: "patch",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + NOTION_TOKEN,
          "Notion-Version": "2022-06-28"
        },
        payload: JSON.stringify({ archived: true })
      };
      UrlFetchApp.fetch("https://api.notion.com/v1/pages/" + pageId, options);
    }
  });

  // === REMOVE DUPLICATE NOTION ROWS ===
  Object.keys(duplicates).forEach(function(fileId) {
    duplicates[fileId].forEach(function(pageId) {
      var options = {
        method: "patch",
        contentType: "application/json",
        headers: {
          "Authorization": "Bearer " + NOTION_TOKEN,
          "Notion-Version": "2022-06-28"
        },
        payload: JSON.stringify({ archived: true })
      };
      UrlFetchApp.fetch("https://api.notion.com/v1/pages/" + pageId, options);
    });
  });

  Logger.log("Sync complete!");
}
