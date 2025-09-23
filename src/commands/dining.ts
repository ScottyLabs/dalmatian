import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { Command } from "../types";

interface Time {
  day: number,
  hour: number,
  minute: number,
}

interface Location {
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
  acceptsOnlineOrders: boolean,
  times:{
      start: Time,
      end: Time
    }[]
}

function getLocations(): Promise<Location[]> {
  const request : RequestInfo = new Request("https://dining.apis.scottylabs.org/locations", {
    method: "GET",
  });

  return fetch(request)
    .then(res => res.json())
    .then(data => {
      return data.locations as Location[];
    });
}

function isBetween(now : Time, start : Time, end : Time) : boolean {
  if (start.day === now.day || end.day === now.day) {
    return start.hour < now.hour && now.hour < end.hour
      || (start.hour === now.hour && start.minute <= now.minute)
      || (end.hour === now.hour && now.minute <= end.minute);
  }
  return start.day < now.day && now.day < end.day;
}

function isOpen(location: Location, time : Time) : boolean {
  for (const openTime of location.times)
    if(isBetween(time, openTime.start, openTime.end))
      return true;
  return false;
}

function formatLocation(location : Location) : EmbedBuilder {
  if(!location) {
    return new EmbedBuilder()
      .setTitle("Dining Location Not Found")
      .setDescription("The specified dining location could not be found.");
  }

  let embed = new EmbedBuilder()
    .setTitle(location.name)
    .setDescription(location.description)
    .addFields(
      { name: "Location", value: location.location },
      { name: "Today's Hours", value: location.times.filter(time => {
        const now = new Date();
        return time.start.day === now.getDay();
      }).map(time => {
        const startHour = time.start.hour;
        const startMinute = time.start.minute < 10 ? `0${time.start.minute}` : time.start.minute;

        const endHour = time.end.hour;
        const endMinute = time.end.minute < 10 ? `0${time.end.minute}` : time.end.minute;
        return `${startHour}:${startMinute} - ${endHour}:${endMinute}`;
      }
      ).join(", ") || "Closed" }
    )
    .addFields(
      { name: "Accepts Online Orders", value: location.acceptsOnlineOrders ? "Yes" : "No" }
    )
    .setURL(location.url);

  const url = `https://maps.googleapis.com/maps/api/staticmap?center=${location.coordinates.lat},${location.coordinates.lng}&zoom=17&size=400x200&markers=color:red%7C${location.coordinates.lat},${location.coordinates.lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
  embed.setImage(url);

  return embed;
}

function formatLocations(locations : Location[]) : EmbedBuilder[] {
  if(locations.length === 0) {
    return [new EmbedBuilder()
      .setTitle("Dining Locations")
      .setDescription("No dining locations currently open.")];
  }
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
    .setName("dining")
    .setDescription("Show on-campus dining locations & hours")
    .addSubcommand(subcommand =>
      subcommand
        .setName("all")
        .setDescription("Show all dining locations"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("open")
        .setDescription("Show currently open dining locations"))
    .addSubcommand(subcommand =>
      subcommand
        .setName("search")
        .setDescription("Search for a specific dining location")
        .addStringOption(option =>
          option.setName("query")
            .setDescription("The name of the dining location to search for")
            .setRequired(true)
            .setAutocomplete(true))),
  execute: async (interaction) => {
    const locations = await getLocations();

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
    if (interaction.options.getSubcommand() === "search") {
      const query = interaction.options.getString("query", true).toLowerCase();
      const matchedLocations = locations.filter(location => location.name.toLowerCase().includes(query));
      return interaction.reply({ embeds: [formatLocation(matchedLocations[0])] });
    }
  },
  autocomplete: async (client, interaction) => {
    const focusedValue = interaction.options.getFocused();

    const locations = await getLocations();

		const choices = search(focusedValue.toLowerCase(), locations, {
			// ignoreCase is true by default
			keySelector: (loc) => loc.name,
		})
			.slice(0, 25)
			.map((loc) => ({ name: loc.name, value: loc.name }));

    await interaction.respond(choices);
  }
};

export default command;