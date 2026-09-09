import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter();

export const model = openrouter('qwen/qwen3.8-27b', {
  extraBody: {
    provider: {
      only: ['reka/fp8','akashml/fp8','coreweave/fp8'],  // 'akashml/fp8', 'coreweave/fp8' , 'reka/fp8' 검증된 후보 3개
      require_parameters: true,
      allow_fallbacks: false,                               
    },
  },
});