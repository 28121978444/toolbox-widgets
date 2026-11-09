/**
 * Shared types for the Model Farm feature: a HuggingFace catalog of local
 * models, a profile of the machine they would run on, and fit verdicts.
 */
/** Display metadata per pipeline task; `order` drives column layout. */
export const MODEL_TASKS = [
    { task: 'text-generation', label: 'Text Generation', icon: '⌁', order: 0 },
    { task: 'text-to-image', label: 'Text to Image', icon: '▦', order: 1 },
    { task: 'text-to-speech', label: 'Text to Speech', icon: '♪', order: 2 },
    { task: 'image-to-text', label: 'Image to Text', icon: '◉', order: 3 },
    { task: 'image-to-image', label: 'Image to Image', icon: '⇄', order: 4 },
    { task: 'text-to-video', label: 'Text to Video', icon: '▸', order: 5 },
    { task: 'any-to-any', label: 'Any to Any', icon: '✳', order: 6 },
    { task: 'automatic-speech-recognition', label: 'Speech to Text', icon: '◷', order: 7 }
];
//# sourceMappingURL=types.js.map