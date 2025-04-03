import { Destructable } from "../Common/Destructable";
import { ComputeWorker } from "../Common/Worker";
// Import the worker directly to prevent webpack chunking issues
import SplitChannelWorkerCode from "./SplitChannelWorker.js";

export class SplitChannel extends Destructable {
  static usage = 0;
  channelCount = 1;
  static worker: ComputeWorker | undefined;

  constructor(channelCount: number) {
    super();
    SplitChannel.usage++;
    if (!SplitChannel.worker) {
      // Create a blob URL from the worker code instead of using dynamic import
      const blob = new Blob([SplitChannelWorkerCode], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      SplitChannel.worker = new ComputeWorker(new Worker(url));
    }
    this.channelCount = channelCount;
  }

  destroy() {
    SplitChannel.usage--;
    if (SplitChannel.usage === 0) {
      SplitChannel.worker?.destroy();
      SplitChannel.worker = undefined;
    }
    super.destroy();
  }

  async split(value: Float32Array): Promise<Float32Array[]> {
    if (!SplitChannel.worker) throw new Error("AudioDecoder: worker not initialized");

    return SplitChannel.worker.compute({
      value,
      channelCount: this.channelCount,
    });
  }
}
