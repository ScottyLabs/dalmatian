import { Client, GatewayIntentBits, Collection } from 'discord.js';
import { join } from 'path';
import { readdirSync } from 'fs';
import { Commands, Events } from './types';
import { config } from 'dotenv';

config();

