import path from "path";
import fs from "fs";
import { Op } from "sequelize";
import Message from "../../models/Message";
import uploadConfig from "../../config/upload";
import { logger } from "../../utils/logger";

const RETENTION_DAYS = 30;
const BATCH_SIZE = 200;
const BATCH_PAUSE_MS = 500;

const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

const CleanupOldMediaService = async (): Promise<void> => {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

    let deletedCount = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const messages = await Message.findAll({
        where: {
          mediaUrl: { [Op.ne]: null as unknown as string },
          createdAt: { [Op.lt]: cutoff }
        },
        limit: BATCH_SIZE
      });

      if (messages.length === 0) {
        break;
      }

      // eslint-disable-next-line no-restricted-syntax
      for (const message of messages) {
        const fileName = message.getDataValue("mediaUrl") as string;

        try {
          // eslint-disable-next-line no-await-in-loop
          await fs.promises.unlink(
            path.join(uploadConfig.directory, fileName)
          );
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            logger.error({ info: "Error deleting media file", err });
          }
        }

        // eslint-disable-next-line no-await-in-loop
        await message.update({ mediaUrl: null });
        deletedCount += 1;
      }

      // eslint-disable-next-line no-await-in-loop
      await delay(BATCH_PAUSE_MS);
    }

    if (deletedCount > 0) {
      logger.info(`CleanupOldMediaService: deleted ${deletedCount} media files`);
    }
  } catch (err) {
    logger.error({ info: "Error running CleanupOldMediaService", err });
  }
};

export default CleanupOldMediaService;
