// Flip to false to go back to the Express server (server.js) for blog,
// projects, custom requests, and the admin portal.
export const SERVERLESS = true;

// Pages that need server.js. In serverless mode they redirect to about.html.
export const SERVER_ONLY_PAGES = new Set([
  "requests",
  "activities",
  "secret",
  "login",
  "admin",
]);
