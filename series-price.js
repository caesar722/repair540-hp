(async function(){
  const root=document.getElementById('series-prices');
  if(!root)return;
  const series=root.dataset.series;
  const wanted=[`iPhone ${series}`,`iPhone ${series} mini`,`iPhone ${series} Plus`,`iPhone ${series} Pro`,`iPhone ${series} Pro Max`];
  try{
    const response=await fetch('prices.json');
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    const category=data.categories.find(item=>item.id==='iphone');
    if(!category||!Array.isArray(category.items))throw new Error('iPhone料金データがありません');
    const items=wanted.map(model=>category.items.find(item=>item.model===model)).filter(Boolean);
    if(items.length!==4)throw new Error(`${series}シリーズの料金データが不足しています`);
    const labels=['機種','画面修理','バッテリー交換','カメラ修理','ドックコネクター修理'];
    root.innerHTML=`<div class="table-wrap"><table><thead><tr>${labels.map(x=>`<th scope="col">${x}</th>`).join('')}</tr></thead><tbody>${items.map(item=>`<tr><td data-label="機種">${item.model}</td><td data-label="画面修理">¥${item.screen}</td><td data-label="バッテリー交換">¥${item.battery}</td><td data-label="カメラ修理">¥${item.camera}</td><td data-label="ドックコネクター修理">¥${item.charging}</td></tr>`).join('')}</tbody></table></div><p class="note">※ ${category.note}</p>`;
  }catch(error){
    console.error('料金データの読み込みに失敗しました:',error);
    root.innerHTML='<p class="status error">料金データを読み込めませんでした。ページを再読み込みするか、LINE・お電話でお問い合わせください。</p>';
  }
})();
