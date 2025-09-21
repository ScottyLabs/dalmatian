import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
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

function formatLocations(locations : location[]) : EmbedBuilder[] {
  // embed field limit is 25, new embed for every 25
  const embeds = [];
  let currentEmbed = new EmbedBuilder()
    .setTitle("Dining Locations")
    .setDescription("Here are the current dining locations:");

  for (const location of locations) {
    if ((currentEmbed.data.fields?.length ?? 0) >= 25) {
      embeds.push(currentEmbed);
      currentEmbed = new EmbedBuilder();
    }

    // TODO: refactor
    let locationFieldBody : string = "Today's Hours: " + location.times.filter(time => {
      const now = new Date();
      return time.start.day === now.getDay();
    }).map(time => {
      const startHour = time.start.hour;
      const startMinute = time.start.minute < 10 ? `0${time.start.minute}` : time.start.minute;

      const endHour = time.end.hour;
      const endMinute = time.end.minute < 10 ? `0${time.end.minute}` : time.end.minute;
      return `${startHour}:${startMinute} - ${endHour}:${endMinute}`;
    }).join(", ");
    if (locationFieldBody === "Today's Hours: ") {
      locationFieldBody += "Closed";
    }
    locationFieldBody += '\n' + location.location;

    currentEmbed.addFields({
        name: location.name,
        value: locationFieldBody,
    });
  }

  embeds.push(currentEmbed);
  return embeds;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("nom")
    .setDescription("Show on-campus dining locations & hours")
    .addSubcommand(subcommand =>
      subcommand
        .setName("all")
        .setDescription("Show all dining locations"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("open")
        .setDescription("Show currently open dining locations")),
  execute: async (interaction) => {
    getLocations().then(locations => {
      if (interaction.options.getSubcommand() === "all") {
        interaction.reply({ embeds: formatLocations(locations.sort((a, b) => a.name.localeCompare(b.name))) });
        return;
      }
      if (interaction.options.getSubcommand() === "open") {
        const rightNow : Time = {
          day: new Date().getDay(),
          hour: new Date().getHours(),
          minute: new Date().getMinutes()
        };

        const openLocations = locations.filter(location => isOpen(location, rightNow));

        interaction.reply({ embeds: formatLocations(openLocations.sort((a, b) => a.name.localeCompare(b.name))) });
      }
    });
  }
};

export default command;