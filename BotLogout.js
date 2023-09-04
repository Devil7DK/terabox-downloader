import { config } from "dotenv";
import { Telegraf } from "telegraf";

config()

const bot = new Telegraf(process.env.BOT_TOKEN, {
    telegram: {
        apiRoot: process.env.BOT_API_SERVER,
    },
})
bot.telegram.logOut().then((success) => success ? console.log("Logged out") : console.error("Failed to logout")).catch(console.error);
