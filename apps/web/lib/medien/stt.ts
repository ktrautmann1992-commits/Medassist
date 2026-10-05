import "server-only";
import { env } from "../env";
import { erzeugeStt, type SttAnbieter } from "./stt-adapter";

/** REQ-406: STT-Anbieter aus `STT_ANBIETER` (`aus` ⇒ `null`). */
export function sttAnbieter(): SttAnbieter | null {
  return erzeugeStt(env().STT_ANBIETER);
}
