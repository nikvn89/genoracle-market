const { JSDOM } = require('jsdom');
const jsdom = new JSDOM(`<!DOCTYPE html><body><div id="root"></div></body>`, {
  url: "https://genoracle-market-nik.vercel.app/",
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
});

jsdom.window.console.log = function() { console.log("LOG:", ...arguments); };
jsdom.window.console.error = function() { console.log("ERROR:", ...arguments); };
jsdom.window.addEventListener("error", (event) => {
  console.log("UNCAUGHT ERROR:", event.error ? event.error.message : event.message);
});
jsdom.window.addEventListener("unhandledrejection", (event) => {
  console.log("UNHANDLED REJECTION:", event.reason);
});

setTimeout(() => {
  console.log("Done waiting");
}, 10000);
