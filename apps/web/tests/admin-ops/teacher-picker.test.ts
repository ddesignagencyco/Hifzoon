import { describe, expect, it } from 'vitest';
import { mergeTeacherOptions } from '@/components/admin/shared/Pickers';

describe('TeacherPicker options', () => {
  it('includes cleared teachers from the public directory, not only those with enrolments', () => {
    const options = mergeTeacherOptions(
      [{ id: 'tp-match', name: 'Ustadha Khadija (match)' }],
      [
        { id: 'tp-new', name: 'Ustadh Zaid' },
        { id: 'tp-match', name: 'Ustadha Khadija' },
      ],
      [{ teacher: { id: 'tp-old', user: { name: 'Ustadh Bilal' } } }, { teacher: null }],
      '',
    );
    expect(options).toEqual([
      { id: 'tp-old', name: 'Ustadh Bilal' },
      { id: 'tp-new', name: 'Ustadh Zaid' },
      { id: 'tp-match', name: 'Ustadha Khadija (match)' },
    ]);
  });

  it('keeps a pasted value selectable', () => {
    expect(mergeTeacherOptions([], [], [], 'tp-pasted')).toEqual([{ id: 'tp-pasted', name: 'Selected teacher' }]);
  });
});
