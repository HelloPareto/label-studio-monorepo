// This is the worker code as a JavaScript string to avoid chunk creation 
const workerCode = `
function splitChannels({
  value,
  channelCount,
}) {
  const channels = [];

  // Create new Float32Array for each channel
  for (let c = 0; c < channelCount; c++) {
    channels[c] = new Float32Array(value.length / channelCount);
  }

  // Split the channels into separate Float32Array samples
  for (let sample = 0; sample < value.length; sample++) {
    // interleaved channels
    // ie. 2 channels
    // [channel1, channel2, channel1, channel2, ...]
    const channel = sample % channelCount;
    // index of the channel sample
    // ie. 2 channels
    // sample = 8, channel = 0, channelIndex = 4
    // sample = 9, channel = 1, channelIndex = 4
    // sample = 10, channel = 0, channelIndex = 5
    // sample = 11, channel = 1, channelIndex = 5
    const channelIndex = Math.floor(sample / channelCount);

    channels[channel][channelIndex] = value[sample];
  }

  return channels;
}

// Create a self-executing function to handle messages
self.onmessage = function(e) {
  const { type, id, data } = e.data;
  
  if (type === 'compute' || type === 'precompute') {
    const result = splitChannels(data);
    self.postMessage({ id, data: result });
  }
};
`;

export default workerCode; 