import { config } from "dotenv";
import { Telegraf } from "telegraf";

config()

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.telegram.logOut().then((success) => success ? console.log("Logged out") : console.error("Failed to logout")).catch(console.error);
