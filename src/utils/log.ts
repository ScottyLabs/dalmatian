import { getAnsiColorFormatter, getLogger } from "@logtape/logtape";
import { configure, getConsoleSink } from "@logtape/logtape";

export const logger = getLogger("dalmatian");

export async function configureLogger() {
    await configure({
        sinks: {
            console: getConsoleSink({
                formatter: getAnsiColorFormatter({
                    timestamp: "date-time-timezone",
                    timeZone: "America/New_York",
                    level: "FULL",
                }),
            }),
        },
        loggers: [
            {
                category: "dalmatian",
                lowestLevel: "info",
                sinks: ["console"],
            },
            {
                category: ["logtape", "meta"],
                lowestLevel: "warning",
                sinks: ["console"],
            }
        ],
    });
}

// Since someone back in ye olde day decided that you can throw literally anything, we need this to keep logtape happy...
export function nodeError(error: unknown): Error {
    if (error instanceof Error) {
        return error;
    } else {
        return new Error(String(error));
    }
}
