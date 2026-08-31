(function () {
  'use strict';

  const storeInfo = {
    addressShort: '大分県大分市都町',
    open: '10:30〜19:00',
    holiday: '不定休',
    holidayMonth: '9月',
    holidayDates: [
      '4日',
      '5日',
      '10日',
      '12日',
      '14日',
      '18日',
      '24日',
      '28日',
      '29日'
    ]
  };

  function renderHolidayDates(element) {
    element.replaceChildren();

    storeInfo.holidayDates.forEach((date, index) => {
      const dateItem = document.createElement('span');
      dateItem.className = 'store-holiday-date-item';
      dateItem.textContent = date + (index < storeInfo.holidayDates.length - 1 ? '・' : '');
      element.appendChild(dateItem);

      if (index < storeInfo.holidayDates.length - 1) {
        element.appendChild(document.createElement('wbr'));
      }
    });
  }

  function renderStoreInfo() {
    document.querySelectorAll('[data-store-info]').forEach((element) => {
      const key = element.dataset.storeInfo;

      if (key === 'holidayTitle') {
        element.textContent = `${storeInfo.holidayMonth}店休日`;
      } else if (key === 'holidayDates') {
        renderHolidayDates(element);
      } else if (Object.prototype.hasOwnProperty.call(storeInfo, key)) {
        element.textContent = storeInfo[key];
      }
    });
  }

  window.storeInfo = storeInfo;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderStoreInfo);
  } else {
    renderStoreInfo();
  }
}());
