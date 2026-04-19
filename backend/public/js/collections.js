
const Collections = {
  data: [],
  currentCollId: null,

  async load() {
    if (!currentSiteId) return;
    try {
      const resp = await fetch(`${API}/collections/${currentSiteId}`);
      this.data = await resp.json();
      this.renderList();
    } catch(e) {
      console.error(e);
    }
  },

  renderList() {
    const list = document.getElementById('collectionList');
    if(this.data.length === 0) {
      list.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8">Chua c� Kho D? Li?u n�o.<br><button class="btn btn-secondary" style="margin-top:10px" onclick="Collections.showCreateForm()">+ T?o Kho (B?ng) M?i</button></div>';
      return;
    }
    
    list.innerHTML = `<div style="margin-bottom:15px;"><button class="btn btn-secondary" onclick="Collections.showCreateForm()">+ T?o Kho (B?ng) M?i</button></div>` 
      + this.data.map(c => `
      <div style="background:white; border-radius:8px; padding:15px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.1); border-left: 4px solid #3b82f6;">
        <h3 style="margin:0 0 5px 0;">${c.name} <span style="font-size:12px; font-weight:normal; color:#64748b">(${c.slug})</span></h3>
        <p style="margin:0; font-size:13px; color:#64748b;">${c.fields.length} tru?ng c?u tr�c</p>
        <div style="margin-top:10px;">
          <button class="btn btn-primary" onclick="Collections.manageItems(${c.id})">Nh?p / S?a D? Li?u</button>
          <button class="btn btn-ghost" onclick="Collections.deleteColl(${c.id})" style="color:#ef4444; border:1px solid #fee2e2">X�a Kho</button>
        </div>
      </div>
    `).join('');
  },

  showCreateForm() {
     document.getElementById('colCreateModal').style.display = 'flex';
  },
  
  closeCreateForm() {
     document.getElementById('colCreateModal').style.display = 'none';
  },

  async createCollection() {
     const name = document.getElementById('colName').value;
     const slug = document.getElementById('colSlug').value;
     if(!name || !slug) return alert('Vui l�ng di?n d? t�n v� slug!');
     
     // Th�m 2 field m?c d?nh: T�m t?t, N?i dung
     const fields = [
       { name: '?nh �?i Di?n', field_key: 'thumbnail', field_type: 'image', is_required: 0 },
       { name: 'M� T? Ng?n', field_key: 'description', field_type: 'text', is_required: 0 },
       { name: 'N?i Dung Chi Ti?t', field_key: 'content', field_type: 'rich_text', is_required: 0 }
     ];

     try {
       await fetch(`${API}/collections/${currentSiteId}`, {
         method: 'POST',
         headers: {'Content-Type':'application/json'},
         body: JSON.stringify({ name, slug, fields })
       });
       Toast.success('�� t?o Kho d? li?u!');
       this.closeCreateForm();
       this.load();
     } catch(e) {
       alert(e.message);
     }
  },

  async deleteColl(id) {
     if(!confirm('Xo� kho n�y s? X�A TO�N B? NG�N B�I VI?T B�N TRONG! B?n lu?ng tru?c h?u qu? chua?')) return;
     try {
       await fetch(`${API}/collections/${currentSiteId}/${id}`, { method: 'DELETE' });
       Toast.success('�� x�a kho d? li?u');
       this.load();
     } catch(e) { }
  },

  async manageItems(id) {
    this.currentCollId = id;
    const coll = this.data.find(c => c.id === id);
    document.getElementById('colItemTitle').textContent = 'Qu?n L�: ' + coll.name;
    document.getElementById('colListArea').style.display = 'none';
    document.getElementById('colItemsArea').style.display = 'block';
    
    this.loadItems();
  },

  backToList() {
    this.currentCollId = null;
    document.getElementById('colItemsArea').style.display = 'none';
    document.getElementById('colListArea').style.display = 'block';
  },

  async loadItems() {
    try {
      const resp = await fetch(`${API}/collections/${currentSiteId}/${this.currentCollId}/items`);
      const items = await resp.json();
      
      const list = document.getElementById('colItemsList');
      if(items.length===0){
         list.innerHTML = '<p>Chua c� b?n ghi n�o.</p>';
      } else {
         list.innerHTML = items.map(i => `
           <div style="padding:10px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
              <div><strong>${i.title}</strong> (${i.slug})</div>
              <button class="btn btn-ghost" onclick="Collections.deleteItem(${i.id})">X�a</button>
           </div>
         `).join('');
      }
    } catch(e) {}
  },

  openAddItem() {
    const coll = this.data.find(c => c.id === this.currentCollId);
    let html = '';
    for(let f of coll.fields) {
       html += `
         <div class="form-group" style="margin-bottom:10px">
           <label class="form-label">${f.name} (${f.field_key})</label>
           <input type="text" class="form-input col-dynamic-input" data-key="${f.field_key}" placeholder="Nh?p du li?u ${f.field_type}">
         </div>
       `;
    }
    document.getElementById('colItemFieldsForm').innerHTML = html;
    document.getElementById('colItemModal').style.display = 'flex';
  },

  closeItemModal() {
    document.getElementById('colItemModal').style.display = 'none';
  },

  async saveItem() {
    const title = document.getElementById('colItemName').value;
    const slug = document.getElementById('colItemSlug').value;
    
    const data = {};
    document.querySelectorAll('.col-dynamic-input').forEach(input => {
       data[input.getAttribute('data-key')] = input.value;
    });

    try {
      await fetch(`${API}/collections/${currentSiteId}/${this.currentCollId}/items`, {
         method: 'POST',
         headers: {'Content-Type':'application/json'},
         body: JSON.stringify({ title, slug, data })
      });
      Toast.success('�� luu Item!');
      this.closeItemModal();
      this.loadItems();
    } catch(e) { }
  },

  async deleteItem(id) {
    if(!confirm('Xo� b?n ghi n�y?')) return;
    try {
      await fetch(`${API}/collections/${currentSiteId}/${this.currentCollId}/items/${id}`, { method: 'DELETE' });
      this.loadItems();
    } catch(e) {}
  }
};
