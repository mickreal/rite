import { Config } from "@remotion/cli/config";

// The brand TTFs live in content/fonts (shared with the clip generator); serve them as Remotion's public dir.
Config.setPublicDir("../fonts");
Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(92);
Config.setOverwriteOutput(true);
// Same Chromium as the clip generator; override with CHROMIUM=/path, or pass --browser-executable on the CLI.
Config.setBrowserExecutable(process.env.CHROMIUM ?? "/opt/pw-browsers/chromium");
// A full Chrome binary (not chrome-headless-shell) only supports new headless mode.
Config.setChromeMode("chrome-for-testing");
