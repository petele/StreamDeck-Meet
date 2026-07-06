'use strict';

const DEFAULTS = {
  mini: {
    // Lobby
    'start-instant': 6,
    'start-next': 5,
    // Green Room
    'cam': 1,
    'cam-disabled': 1,
    'enter-meeting': 6,
    'mic': 4,
    'mic-disabled': 4,
    // Meeting
    'cc': -1,
    'cc-on': -1,
    'reaction': 6,
    'reaction-open': 6,
    'chat': 3,
    'chat-open': 3,
    'end-call': -1,
    'hand': 5,
    'hand-raised': 5,
    'present-stop': -1,
    'blank': -1,
    'users': 2,
    'users-open': 2,
    // Exit Hall
    'home': 1,
    'rejoin': 6,
  },
  v1: {
    'fullscreen-on': 5,
    'fullscreen-off': 5,
    'fullscreen-disabled': 5,
    'start-next': 15,
    'start-instant': 14,
    'enter-meeting': 1,
    'mic': 15,
    'mic-disabled': 15,
    'cam': 14,
    'cam-disabled': 14,
    'reaction': 2,
    'reaction-open': 2,
    'info': 1,
    'info-open': 1,
    'users': 9,
    'users-open': 9,
    'chat': 8,
    'chat-open': 8,
    'activities': 7,
    'activities-open': 7,
    'present-stop': 6,
    'blank': 6,
    'cc': 13,
    'cc-on': 13,
    'hand': 12,
    'hand-raised': 12,
    'end-call': 11,
    'home': 11,
    'rejoin': 15,
  },
  v2: {
    'fullscreen-on': 4,
    'fullscreen-off': 4,
    'fullscreen-disabled': 4,
    'start-next': 5,
    'start-instant': 6,
    'enter-meeting': 5,
    'mic': 10,
    'mic-disabled': 10,
    'cam': 11,
    'cam-disabled': 11,
    'reaction': 0,
    'reaction-open': 0,
    'info': 5,
    'info-open': 5,
    'users': 6,
    'users-open': 6,
    'cc': 7,
    'cc-on': 7,
    'activities': 8,
    'activities-open': 8,
    'present-stop': 9,
    'blank': 9,
    'chat': 12,
    'chat-open': 12,
    'hand': 13,
    'hand-raised': 13,
    'end-call': 14,
    'home': 14,
    'rejoin': 10,
  },
  xl: {
    'fullscreen-on': 5,
    'fullscreen-off': 5,
    'fullscreen-disabled': 5,
    'start-next': 8,
    'start-instant': 9,
    'enter-meeting': 8,
    'mic': 16,
    'mic-disabled': 16,
    'cam': 17,
    'cam-disabled': 17,
    'reaction': 6,
    'reaction-open': 6,
    'info': 8,
    'info-open': 8,
    'users': 9,
    'users-open': 9,
    'chat': 10,
    'chat-open': 10,
    'activities': 11,
    'activities-open': 11,
    'present-stop': 12,
    'blank': 12,
    'cc': 18,
    'cc-on': 18,
    'hand': 19,
    'hand-raised': 19,
    'end-call': 20,
    'home': 20,
    'rejoin': 16,
  },
};

const CONFIG_ITEMS = [
  {
    category: 'Lobby Screen',
    items: [
      {
        id: 'start-next',
        label: 'Start Next Scheduled Meeting',
        keyName: 'start-next',
      },
      {
        id: 'start-instant',
        label: 'Start Instant Meeting',
        keyName: 'start-instant',
      },
    ],
  },
  {
    category: 'Green Room Screen',
    items: [
      {
        id: 'enter-meeting',
        label: 'Join/Enter Meeting Button',
        keyName: 'enter-meeting',
      },
    ],
  },
  {
    category: 'Meeting Screen',
    items: [
      {
        id: 'mic',
        label: 'Mute / Unmute Microphone',
        keyName: 'mic',
        linked: ['mic-disabled'],
      },
      {
        id: 'cam',
        label: 'Start / Stop Video Camera',
        keyName: 'cam',
        linked: ['cam-disabled'],
      },
      {
        id: 'cc',
        label: 'Toggle Captions',
        keyName: 'cc',
        linked: ['cc-on'],
      },
      {
        id: 'hand',
        label: 'Raise / Lower Hand',
        keyName: 'hand',
        linked: ['hand-raised'],
      },
      {
        id: 'reaction',
        label: 'Reactions Panel Toggle',
        keyName: 'reaction',
        linked: ['reaction-open'],
      },
      {
        id: 'chat',
        label: 'Chat Panel Toggle',
        keyName: 'chat',
        linked: ['chat-open'],
      },
      {
        id: 'users',
        label: 'Users List Panel Toggle',
        keyName: 'users',
        linked: ['users-open'],
      },
      {
        id: 'activities',
        label: 'Activities Panel Toggle',
        keyName: 'activities',
        linked: ['activities-open'],
      },
      {
        id: 'info',
        label: 'Meeting Info Panel Toggle',
        keyName: 'info',
        linked: ['info-open'],
      },
      {
        id: 'fullscreen',
        label: 'Fullscreen Toggle',
        keyName: 'fullscreen-on',
        linked: ['fullscreen-off', 'fullscreen-disabled'],
      },
      {
        id: 'present-stop',
        label: 'Stop Presenting Screen',
        keyName: 'present-stop',
        linked: ['blank'],
      },
      {
        id: 'end-call',
        label: 'End Call Button',
        keyName: 'end-call',
      },
    ],
  },
  {
    category: 'Exit Hall Screen',
    items: [
      {
        id: 'home',
        label: 'Return to Home Page',
        keyName: 'home',
      },
      {
        id: 'rejoin',
        label: 'Rejoin Meeting Button',
        keyName: 'rejoin',
      },
    ],
  },
];

const MODEL_SPECS = {
  mini: {numKeys: 6, keyStart: 1, cols: 3, rows: 2, keySize: 80},
  v1: {numKeys: 15, keyStart: 1, cols: 5, rows: 3, keySize: 72},
  v2: {numKeys: 15, keyStart: 0, cols: 5, rows: 3, keySize: 72},
  xl: {numKeys: 32, keyStart: 0, cols: 8, rows: 4, keySize: 96},
};

let currentMappings = {};

// DOM Elements
const deviceModelSelect = document.getElementById('device-model');
const actionsListDiv = document.getElementById('actions-list');
const mappingsForm = document.getElementById('mappings-form');
const resetBtn = document.getElementById('reset-btn');
const sdPreviewGrid = document.getElementById('sd-preview-grid');
const statusToast = document.getElementById('status-toast');

/**
 * Show a toast notification
 * @param {string} message Text to show in the toast
 */
function showToast(message) {
  statusToast.textContent = message;
  statusToast.classList.add('show');
  setTimeout(() => {
    statusToast.classList.remove('show');
  }, 2000);
}

/**
 * Get options key for the model
 * @param {string} model Model name
 * @return {string} Storage key
 */
function getStorageKey(model) {
  return `mappings_${model}`;
}

/**
 * Render the visual preview grid
 * @param {string} model Model name
 */
function renderPreviewGrid(model) {
  const spec = MODEL_SPECS[model];

  sdPreviewGrid.style.gridTemplateColumns = `repeat(${spec.cols}, 1fr)`;
  sdPreviewGrid.innerHTML = '';

  for (let i = spec.keyStart; i < spec.keyStart + spec.numKeys; i++) {
    const keyDiv = document.createElement('div');
    keyDiv.className = 'sd-key';
    keyDiv.style.width = `${spec.keySize}px`;
    keyDiv.style.height = `${spec.keySize}px`;

    const keyNumSpan = document.createElement('span');
    keyNumSpan.className = 'sd-key-number';
    keyNumSpan.textContent = i.toString();
    keyDiv.appendChild(keyNumSpan);

    const assignedActions = [];

    CONFIG_ITEMS.forEach((categoryGroup) => {
      categoryGroup.items.forEach((item) => {
        const val = currentMappings[item.keyName];
        if (val === i) {
          assignedActions.push({
            name: item.id,
            category: categoryGroup.category.split(' ')[0],
          });
        }
      });
    });

    if (assignedActions.length > 0) {
      keyDiv.classList.add('active');
      const actionsContainer = document.createElement('div');
      actionsContainer.className = 'sd-key-actions';

      assignedActions.forEach((act) => {
        const tag = document.createElement('div');
        tag.className = 'sd-key-action-tag';
        tag.title = `${act.category}: ${act.name}`;
        tag.textContent = `${act.name}`;
        actionsContainer.appendChild(tag);
      });
      keyDiv.appendChild(actionsContainer);
    }

    sdPreviewGrid.appendChild(keyDiv);
  }
}

/**
 * Populate the form and the preview grid
 * @param {string} model Model name
 */
function populateFormAndGrid(model) {
  const spec = MODEL_SPECS[model];

  actionsListDiv.innerHTML = '';

  CONFIG_ITEMS.forEach((categoryGroup) => {
    const categoryTitle = document.createElement('div');
    categoryTitle.className = 'action-group-title';
    categoryTitle.textContent = categoryGroup.category;
    actionsListDiv.appendChild(categoryTitle);

    categoryGroup.items.forEach((item) => {
      const groupDiv = document.createElement('div');
      groupDiv.className = 'form-group';

      const label = document.createElement('label');
      label.htmlFor = `action-${item.id}`;
      label.textContent = item.label;

      const select = document.createElement('select');
      select.id = `action-${item.id}`;
      select.dataset.keyName = item.keyName;
      if (item.linked) {
        select.dataset.linked = item.linked.join(',');
      }

      const disabledOpt = document.createElement('option');
      disabledOpt.value = '-1';
      disabledOpt.textContent = 'Disabled';
      select.appendChild(disabledOpt);

      for (let i = spec.keyStart; i < spec.keyStart + spec.numKeys; i++) {
        const opt = document.createElement('option');
        opt.value = i.toString();
        opt.textContent = `Button ${i}`;
        select.appendChild(opt);
      }

      const val = currentMappings[item.keyName];
      select.value = (val !== undefined && val !== null) ?
          val.toString() : '-1';

      select.addEventListener('change', () => {
        const selectedVal = parseInt(select.value, 10);
        currentMappings[item.keyName] = selectedVal;
        if (item.linked) {
          item.linked.forEach((linkKey) => {
            currentMappings[linkKey] = selectedVal;
          });
        }
        renderPreviewGrid(model);
      });

      groupDiv.appendChild(label);
      groupDiv.appendChild(select);
      actionsListDiv.appendChild(groupDiv);
    });
  });

  renderPreviewGrid(model);
}

/**
 * Load settings for a specific model
 * @param {string} model Model name
 */
async function loadModelSettings(model) {
  const storageKey = getStorageKey(model);

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const result = await chrome.storage.local.get(storageKey);
      if (result[storageKey]) {
        currentMappings = {...result[storageKey]};
      } else {
        currentMappings = {...DEFAULTS[model]};
      }
    } catch (e) {
      console.error('Error loading mappings from storage:', e);
      currentMappings = {...DEFAULTS[model]};
    }
  } else {
    currentMappings = {...DEFAULTS[model]};
  }

  populateFormAndGrid(model);
}

/**
 * Save mappings to chrome.storage.local
 */
async function saveMappings() {
  const model = deviceModelSelect.value;
  const storageKey = getStorageKey(model);

  const mappingsToSave = {};

  CONFIG_ITEMS.forEach((categoryGroup) => {
    categoryGroup.items.forEach((item) => {
      const select = document.getElementById(`action-${item.id}`);
      if (select) {
        const val = parseInt(select.value, 10);
        mappingsToSave[item.keyName] = val;

        if (select.dataset.linked) {
          const linkedKeys = select.dataset.linked.split(',');
          linkedKeys.forEach((linkKey) => {
            mappingsToSave[linkKey] = val;
          });
        }
      }
    });
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      const updateData = {};
      updateData[storageKey] = mappingsToSave;
      await chrome.storage.local.set(updateData);
      showToast('Options saved successfully!');
    } catch (e) {
      console.error('Failed to save settings:', e);
      alert('Failed to save options: ' + e.message);
    }
  } else {
    console.log('Saved mappings for', model, mappingsToSave);
    showToast('Mock Save Completed (No Chrome Extension Context)');
  }
}

/**
 * Initialize options page
 */
async function init() {
  deviceModelSelect.addEventListener('change', async () => {
    await loadModelSettings(deviceModelSelect.value);
  });

  mappingsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveMappings();
  });

  resetBtn.addEventListener('click', async () => {
    const msg = 'Are you sure you want to reset all mappings ' +
        'for this model to their default values?';
    if (confirm(msg)) {
      const model = deviceModelSelect.value;
      currentMappings = {...DEFAULTS[model]};
      populateFormAndGrid(model);
    }
  });

  // Load initial model setting
  await loadModelSettings(deviceModelSelect.value);
}

document.addEventListener('DOMContentLoaded', init);
