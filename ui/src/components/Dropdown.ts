export interface DropdownOption {
  value: string;
  label: string;
}

export class CustomDropdown {
  private element: HTMLElement;
  private options: DropdownOption[];
  private selectedValue: string;
  private onChange: (value: string) => void;
  private isOpen = false;

  private triggerEl: HTMLElement;
  private menuEl: HTMLElement;
  private valueEl: HTMLElement;

  constructor(
    containerId: string,
    options: DropdownOption[],
    initialValue: string,
    onChange: (value: string) => void
  ) {
    const container = document.getElementById(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);

    this.element = container;
    this.options = options;
    this.selectedValue = initialValue;
    this.onChange = onChange;

    this.element.className = 'custom-dropdown';
    this.element.innerHTML = `
      <div class="dropdown-trigger">
        <span class="dropdown-value"></span>
        <svg class="dropdown-arrow" width="10" height="6" viewBox="0 0 10 6" fill="currentColor">
          <path d="M1 1L5 5L9 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        </svg>
      </div>
      <div class="dropdown-menu hidden"></div>
    `;

    this.triggerEl = this.element.querySelector('.dropdown-trigger') as HTMLElement;
    this.menuEl = this.element.querySelector('.dropdown-menu') as HTMLElement;
    this.valueEl = this.element.querySelector('.dropdown-value') as HTMLElement;

    this.renderOptions();
    this.updateValueDisplay();
    this.setupEventListeners();
  }

  private renderOptions() {
    this.menuEl.innerHTML = this.options
      .map(
        (opt) => `
      <div class="dropdown-item ${opt.value === this.selectedValue ? 'selected' : ''}" data-value="${opt.value}">
        ${opt.label}
      </div>
    `
      )
      .join('');

    this.menuEl.querySelectorAll('.dropdown-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const value = (item as HTMLElement).dataset.value!;
        this.select(value);
        this.close();
      });
    });
  }

  private updateValueDisplay() {
    const option = this.options.find((o) => o.value === this.selectedValue);
    if (option) {
      this.valueEl.innerText = option.label;
    }
    // Update selected class in menu
    const items = this.menuEl.querySelectorAll('.dropdown-item');
    items.forEach((item) => {
        if ((item as HTMLElement).dataset.value === this.selectedValue) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

  }

  private setupEventListeners() {
    this.triggerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    document.addEventListener('click', () => {
      if (this.isOpen) this.close();
    });
  }

  private toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  private open() {
    this.isOpen = true;
    this.menuEl.classList.remove('hidden');
    this.triggerEl.classList.add('active');
  }

  private close() {
    this.isOpen = false;
    this.menuEl.classList.add('hidden');
    this.triggerEl.classList.remove('active');
  }

  private select(value: string) {
    this.selectedValue = value;
    this.updateValueDisplay();
    this.onChange(value);
  }
}
