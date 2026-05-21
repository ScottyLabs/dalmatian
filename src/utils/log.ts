import { ansiColorFormatter, getLogger } from "@logtape/logtape";
import { configure, getConsoleSink } from "@logtape/logtape";

export const logger = getLogger("dalmatian");

export async function configureLogger() {
    await configure({
        sinks: {
            console: getConsoleSink({
                formatter: ansiColorFormatter,
            }),
        },
        loggers: [
            {
                category: "dalmatian",
                lowestLevel: "info",
                sinks: ["console"],
            },
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
