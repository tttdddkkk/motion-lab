import { INITIAL_VIEWPORTS } from 'storybook/viewport';
import '../motions/motions.css';
import './preview.css';

export default {
  parameters: {
    layout: 'fullscreen',
    viewport: {
      options: {
        // ビューアのスマホ枠の内寸（260x480 から枠線 6px を引いた値）
        motionLab: { name: 'Motion Lab 枠', styles: { width: '248px', height: '468px' }, type: 'mobile' },
        ...INITIAL_VIEWPORTS,
      },
    },
  },
  initialGlobals: {
    viewport: { value: 'motionLab', isRotated: false },
  },
};
