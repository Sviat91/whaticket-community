import { BufferJSON } from "whaileys";

import WppKey from "../../models/WppKey";
import { getFromRedis } from "../../libs/redisStore";
import { logger } from "../../utils/logger";

interface GetKeysRequest {
  connectionId: number;
  deviceId: number;
  type: string;
  ids: string[];
}

const REDIS_KEY_TYPES = ["session", "sender-keys", "sender-key-memory"];

const swapJidSuffix = (id: string): string | null => {
  if (id.endsWith("@s.whatsapp.net")) {
    return `${id.slice(0, -"@s.whatsapp.net".length)}@lid`;
  }
  if (id.endsWith("@lid")) {
    return `${id.slice(0, -"@lid".length)}@s.whatsapp.net`;
  }
  return null;
};

const GetWppSessionKeys = async ({
  connectionId,
  deviceId,
  type,
  ids
}: GetKeysRequest): Promise<any> => {
  const data: any = {};

  if (REDIS_KEY_TYPES.includes(type)) {
    await Promise.all(
      ids.map(async id => {
        const key = `wpp:${connectionId}:${deviceId}:${type}:${id}`;
        const stored = await getFromRedis(key);

        if (stored) {
          data[id] = JSON.parse(stored, BufferJSON.reviver);
        }
      })
    );

    return data;
  }

  try {
    await Promise.all(
      ids.map(async id => {
        let keyRecord = await WppKey.findOne({
          where: {
            connectionId,
            type,
            keyId: id
          }
        });

        if (!keyRecord && type === "contacts-tc-token") {
          const altId = swapJidSuffix(id);

          if (altId) {
            keyRecord = await WppKey.findOne({
              where: {
                connectionId,
                type,
                keyId: altId
              }
            });
          }
        }

        if (keyRecord) {
          data[id] = JSON.parse(keyRecord.value, BufferJSON.reviver);
        }
      })
    );
  } catch (err) {
    logger.error({
      info: "Error getting keys from database",
      connectionId,
      type,
      err
    });
  }

  return data;
};

export default GetWppSessionKeys;
