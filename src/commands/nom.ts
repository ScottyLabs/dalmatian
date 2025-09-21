import { SlashCommandBuilder } from "discord.js";
import { Command } from "../types.js";

interface Time {
  day: number,
  hour: number,
  minute: number,
}

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
      start: Time,
      end: Time
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

function isOpen(location: location, time : Time) : boolean {
  const nowDay = time.day;
  const nowHour = time.hour;
  const nowMinute = time.minute;

  for (const openTime of location.times) {
    if (openTime.start.day === nowDay) {
      if (openTime.start.hour < nowHour || (openTime.start.hour === nowHour && openTime.start.minute <= nowMinute)) {
        if (openTime.end.hour > nowHour || (openTime.end.hour === nowHour && openTime.end.minute > nowMinute)) {
          return true;
        }
      }
    }
  }
  return false;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("nom")
    .setDescription("Show on-campus dining locations & hours"),
  execute: async (interaction) => {
    getLocations().then(locations => {
      // TODO: implement
      const rightNow : Time = {
        day: new Date().getDay(),
        hour: new Date().getHours(),
        minute: new Date().getMinutes()
      };

      const openLocations = locations.filter(location => isOpen(location, rightNow));
      console.log(openLocations);

      interaction.reply("to be implemented :(");
    });
  }
};

export default command;