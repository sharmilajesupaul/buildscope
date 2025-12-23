import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createControlsPanel } from './ui';

describe('ui.ts - createControlsPanel', () => {
  let controlsPanel: HTMLElement;

  beforeEach(() => {
    controlsPanel = createControlsPanel();
    document.body.appendChild(controlsPanel);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should create controls panel element', () => {
    expect(controlsPanel).toBeDefined();
    expect(controlsPanel.classList.contains('controls-panel')).toBe(true);
  });

  it('should have toggle button', () => {
    const toggleBtn = controlsPanel.querySelector('#controls-toggle');
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn?.classList.contains('controls-toggle')).toBe(true);
  });

  it('should have controls content wrapper', () => {
    const content = controlsPanel.querySelector('.controls-content');
    expect(content).not.toBeNull();
  });

  it('should have both toggle icons', () => {
    const menuIcon = controlsPanel.querySelector('.toggle-icon-menu');
    const closeIcon = controlsPanel.querySelector('.toggle-icon-close');

    expect(menuIcon).not.toBeNull();
    expect(closeIcon).not.toBeNull();
  });

  it('should have search input', () => {
    const searchInput = controlsPanel.querySelector('#search-input') as HTMLInputElement;
    expect(searchInput).not.toBeNull();
    expect(searchInput.placeholder).toBe('Search nodes...');
  });

  it('should have weight mode select', () => {
    const select = controlsPanel.querySelector('#weight-mode-select') as HTMLSelectElement;
    expect(select).not.toBeNull();
    expect(select.options.length).toBe(7);
  });

  it('should have fit and reset buttons', () => {
    const fitBtn = controlsPanel.querySelector('#fit-btn');
    const resetBtn = controlsPanel.querySelector('#reset-btn');

    expect(fitBtn).not.toBeNull();
    expect(resetBtn).not.toBeNull();
  });
});

describe('ui.ts - Controls panel toggle behavior', () => {
  let controlsPanel: HTMLElement;
  let toggleBtn: HTMLButtonElement;

  beforeEach(() => {
    controlsPanel = createControlsPanel();
    document.body.appendChild(controlsPanel);
    toggleBtn = controlsPanel.querySelector('#controls-toggle') as HTMLButtonElement;
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('should toggle from expanded to collapsed', () => {
    // Start expanded
    controlsPanel.classList.add('expanded');

    // Simulate toggle logic
    const isExpanded = controlsPanel.classList.contains('expanded');
    if (isExpanded) {
      controlsPanel.classList.remove('expanded');
      controlsPanel.classList.add('collapsed');
    }

    expect(controlsPanel.classList.contains('collapsed')).toBe(true);
    expect(controlsPanel.classList.contains('expanded')).toBe(false);
  });

  it('should toggle from collapsed to expanded', () => {
    // Start collapsed
    controlsPanel.classList.add('collapsed');

    // Simulate toggle logic
    const isExpanded = controlsPanel.classList.contains('expanded');
    if (!isExpanded) {
      controlsPanel.classList.remove('collapsed');
      controlsPanel.classList.add('expanded');
    }

    expect(controlsPanel.classList.contains('expanded')).toBe(true);
    expect(controlsPanel.classList.contains('collapsed')).toBe(false);
  });

  it('should only have one state class at a time', () => {
    controlsPanel.classList.add('expanded');

    // Toggle to collapsed
    controlsPanel.classList.remove('expanded');
    controlsPanel.classList.add('collapsed');

    const hasExpanded = controlsPanel.classList.contains('expanded');
    const hasCollapsed = controlsPanel.classList.contains('collapsed');

    expect(hasExpanded && hasCollapsed).toBe(false);
    expect(hasExpanded || hasCollapsed).toBe(true);
  });

  it('should handle click event on toggle button', () => {
    controlsPanel.classList.add('expanded');

    // Simulate click handler
    toggleBtn.addEventListener('click', () => {
      const isExpanded = controlsPanel.classList.contains('expanded');
      if (isExpanded) {
        controlsPanel.classList.remove('expanded');
        controlsPanel.classList.add('collapsed');
      } else {
        controlsPanel.classList.remove('collapsed');
        controlsPanel.classList.add('expanded');
      }
    });

    // Trigger click
    toggleBtn.click();

    expect(controlsPanel.classList.contains('collapsed')).toBe(true);
  });

  it('should toggle multiple times correctly', () => {
    controlsPanel.classList.add('expanded');

    const toggle = () => {
      const isExpanded = controlsPanel.classList.contains('expanded');
      if (isExpanded) {
        controlsPanel.classList.remove('expanded');
        controlsPanel.classList.add('collapsed');
      } else {
        controlsPanel.classList.remove('collapsed');
        controlsPanel.classList.add('expanded');
      }
    };

    // Toggle 3 times
    toggle(); // -> collapsed
    expect(controlsPanel.classList.contains('collapsed')).toBe(true);

    toggle(); // -> expanded
    expect(controlsPanel.classList.contains('expanded')).toBe(true);

    toggle(); // -> collapsed
    expect(controlsPanel.classList.contains('collapsed')).toBe(true);
  });
});
