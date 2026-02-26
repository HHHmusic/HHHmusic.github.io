/**
 * 侧边菜单、搜索窗口
*/
document.addEventListener('DOMContentLoaded', function() {

    function safeBindClick(id, callback) {
      const el = document.getElementById(id);
      if (el) {
        el.onclick = callback;
      }
    }

    function closeAllOverlays() {
      const drawer = document.getElementById('mobileNavDrawer');
      const modal = document.getElementById('searchModal');
      
      if (drawer) drawer.classList.remove('active');
      if (modal) modal.classList.remove('active');
      
      document.body.style.overflow = '';
    }

    safeBindClick('NavBurgerBtn', function() {
      const drawer = document.getElementById('mobileNavDrawer');
      if (drawer) {
        drawer.classList.add('active');
        document.body.style.overflow = 'hidden';
      }
    });

    safeBindClick('navDrawerMask', closeAllOverlays);
    safeBindClick('navDrawerCloseBtn', closeAllOverlays);

    safeBindClick('NavSearchBtn', function() {
      const modal = document.getElementById('searchModal');
      if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        setTimeout(function() {
          const input = document.querySelector('.search-modal-input');
          if (input) input.focus();
        }, 150);
      }
    });

    safeBindClick('searchModalMask', closeAllOverlays);
    safeBindClick('searchModalCloseBtn', closeAllOverlays);

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        closeAllOverlays();
      }
    });

});