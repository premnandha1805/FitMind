import {
  buildClassificationPrompt,
  buildFitCheckPrompt,
  buildOutfitValidationPrompt,
  buildScenarioPrompt,
  validateAIResponse,
} from '../src/constants/aiPrompts';

describe('aiPrompts', () => {
  test('prompt builders include task-critical context', () => {
    expect(buildOutfitValidationPrompt([{ index: 0, colors: ['#fff'], patterns: ['solid'] }], 'personal', 'work'))
      .toContain('OCCASION: work');
    expect(buildFitCheckPrompt('Tone 3', 'Warm', 'classic', 'personal')).toContain('Tone 3');
    expect(buildScenarioPrompt('interview', 'personal', 'closet')).toContain('CLOSET: closet');
    expect(buildClassificationPrompt()).toContain('top|bottom|shoes');
  });

  test('validateAIResponse extracts fenced JSON and reports missing fields', () => {
    const valid = validateAIResponse('```json\n{"a":{"b":1},"items":[]}\n```', ['a.b', 'items']);
    expect(valid.valid).toBe(true);
    expect(valid.data.a.b).toBe(1);

    const invalid = validateAIResponse('{"a":{}}', ['a.b']);
    expect(invalid.valid).toBe(false);
    expect(invalid.missing).toEqual(['a.b']);
  });
});
