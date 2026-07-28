import { BufferJSON } from "whaileys";

import WppKey from "../../models/WppKey";
import { setInRedis } from "../../libs/redisStore";
import { logger } from "../../utils/logger";

interface StoreKeyRequest {
  connectionId: number;
  deviceId: number;
  type: string;
  id: string;
  value: any;
}

const REDIS_KEY_TYPES = ["session", "sender-keys", "sender-key-memory"];

const StoreWppSessionKeys = async ({
  connectionId,
  deviceId,
  type,
  id,
  value
}: StoreKeyRequest): Promise<void> => {
  const valueJson = JSON.stringify(value, BufferJSON.replacer);

  if (REDIS_KEY_TYPES.includes(type)) {
    const redisKey = `wpp:${connectionId}:${deviceId}:${type}:${id}`;
    await setInRedis(redisKey, valueJson);

    return;
  }

  const MAX_ATTEMPTS = 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      await WppKey.upsert({
        connectionId,
        type,
        keyId: id,
        value: valueJson
      });

      return;
    } catch (err: any) {
      const isDeadlock =
        err?.original?.code === "ER_LOCK_DEADLOCK" ||
        err?.parent?.code === "ER_LOCK_DEADLOCK";

      if (isDeadlock && attempt < MAX_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, 200));
        continue;
      }

      logger.error({
        info: "Error storing key in database",
        connectionId,
        type,
        keyId: id,
        err
      });

      return;
    }
  }
};

export default StoreWppSessionKeys;
