import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.js";

interface location {
  conceptID: number,
  name: string,
  shortDescription: string,
  description: string,
  url: string,
  location: string,
  coordinates: {
    lat: number,
    lng: number
  },
  acceptOnlineOrders: boolean,
  times: [
    {
      start: {
        day: number,
        hour: number,
        minute: number
      },
      end: {
        day: number,
        hour: number,
        minute: number
      }
    }
  ]
}

function getLocations(): Promise<location[]> {
  const request : RequestInfo = new Request("https://dining.apis.scottylabs.org/locations", {
    method: "GET",
  });

  return fetch(request)
    .then(res => res.json())
    .then(data => {
      return data.locations as location[];
    });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("nom")
    .setDescription("Show on-campus dining locations & hours"),
  execute: async (interaction) => {
    getLocations().then(locations => {
      // TODO: implement

      interaction.reply("to be implemented :(");
    });
  }
};

export default command;