function e(t=""){return String(t).replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i])}var d=(t,i=!1)=>`${i?"/admin":""}/image/${t.id}?v=${t.image_revision}`;function f(t="",i="",l="/admin/login"){return`
    <div class="login panel">
      <p class="eyebrow"><span></span> Gallery administration</p>
      <h1>Staff sign-in</h1>
      ${t?`<p class="alert" role="alert">${e(t)}</p>`:""}
      <form method="post" action="${e(l)}" class="stack">
        <label>Email<input type="email" name="email" value="${e(i)}" maxlength="254" autocomplete="username" required></label>
        <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
        <button class="button primary">Sign in</button>
      </form>
    </div>`}var m={dashboard:"/admin",edit:t=>`/admin/artwork/${t}`,image:t=>d(t,!0),logout:"/admin/logout"};function o(t){return t?`<input type="hidden" name="csrf" value="${e(t.csrf)}">`:""}function b(t,i,l,s=m,n=""){return`
    <div class="admin-heading">
      <div><p class="eyebrow"><span></span> Gallery administration</p><h1>Manage artwork</h1></div>
      <div class="toolbar">
        <a class="button primary" href="${e(s.edit("new"))}">Add artwork</a>
        <form method="post" action="${e(s.logout)}">
          ${o(i)}
          <button class="button secondary">Sign out</button>
        </form>
      </div>
    </div>
    ${n?`<p class="alert" role="alert">${e(n)}</p>`:""}
    ${l?`<p class="notice" role="status">${e(l)}</p>`:""}
    ${t.length?`<ul class="work-list">${t.map(a=>`
      <li>${s.image(a)?`<img src="${e(s.image(a))}" alt="" loading="lazy">`:"<span></span>"}
        <div><strong>${e(a.title)}</strong><br><span class="muted">${e(a.artist)}</span></div>
        <span class="state ${e(a.status)}">${a.status==="published"?"Published":"Draft"}${a.featured?" \xB7 Featured":""}</span>
        <a class="button secondary" href="${e(s.edit(a.id))}" aria-label="Edit ${e(a.title)}">Edit</a>
      </li>`).join("")}</ul>`:'<p class="panel">The catalog is empty. Add an artwork to get started.</p>'}`}function v(t,i,{error:l="",values:s=t||{},links:n=m}={}){let a=!!t,u=a?"Edit artwork":"Add artwork",c=n.edit(t?.id||"new"),r=(p,h,$,g=!1)=>`<label>${h}<input name="${p}" value="${e(s[p])}" maxlength="${$}" ${g?"required":""}></label>`;return`
    <a class="back" href="${e(n.dashboard)}">Back to artwork</a>
    <div class="admin-heading"><h1>${u}</h1></div>
    ${l?`<p class="alert" role="alert">${e(l)}</p>`:""}
    <form method="post" action="${e(c)}" enctype="multipart/form-data" class="editor">
      ${o(i)}
      <div class="panel stack">
        ${r("title","Title",120,!0)}
        ${r("artist","Artist",120,!0)}
        <div class="field-row">${r("medium","Medium",80,!0)}${r("year","Year",20)}</div>
        ${r("dimensions","Dimensions",80)}
        <label>Description<textarea name="description" rows="5" maxlength="2000">${e(s.description)}</textarea></label>
      </div>
      <div class="panel stack">
        ${a&&n.image(t)?`<img class="edit-image" src="${e(n.image(t))}" alt="${e(t.alt_text)}">`:""}
        <label>${a?"Replace image":"Artwork image"}<input name="image" type="file" accept="image/jpeg,image/png,image/webp" ${a?"":"required"}>
          <span class="muted help">JPEG, PNG or WebP. Up to 6 MB.</span></label>
        ${r("alt_text","Image description for screen readers",240,!0)}
        <label>Visibility<select name="status">
          <option value="draft">Draft</option>
          <option value="published"${s.status==="published"?" selected":""}>Published</option>
        </select></label>
        <label class="check"><input type="checkbox" name="featured" value="yes"${s.featured?" checked":""}> Feature on the homepage when published</label>
        <button class="button primary">Save artwork</button>
      </div>
    </form>
    ${a?`<details class="remove">
      <summary>Delete artwork</summary>
      <p>This permanently removes the record and its image.</p>
      <form method="post" action="${e(n.delete?n.delete(t.id):c+"/delete")}">
        ${o(i)}
        <button class="button danger">Permanently delete artwork</button>
      </form>
    </details>`:""}`}export{b as dashboardContent,v as editorContent,f as loginContent};
