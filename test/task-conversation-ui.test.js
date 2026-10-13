'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.events={};this.value='';const set=new Set();this.classList={add:c=>set.add(c),contains:c=>set.has(c),toggle:(c,on)=>{if(on===undefined?!set.has(c):on)set.add(c);else set.delete(c);}};}
  appendChild(child){child.parent=this;this.children.push(child);return child;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
  setAttribute(k,v){this.attrs[k]=v;} addEventListener(k,v){this.events[k]=v;} focus(){}
  set innerHTML(v){throw Error('User content must not enter innerHTML');}
}
(async()=>{
  const ctx={document:{createElement:t=>new Element(t)},module:{exports:{}}};vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(require.resolve('../frontend/app/taskconversation.js'),'utf8'),ctx);
  const root=new Element('root'),sent=[];let accept=false;
  const {card,input}=ctx.module.exports.TaskConversation.mount(root,{asker:'NOVA',question:'Walk me through the last update.',options:['A Google Doc','Slack'],reason:'So the report matches how you work.',context:{facts:[{dimension:'sources',text:'Read Slack',quote:'<script>untrusted words</script>'}],assumptions:['One client'],unknowns:['Timing']}},async t=>{sent.push(t);return accept;});
  const all=()=>{const nodes=[];const visit=n=>{nodes.push(n);n.children.forEach(visit);};visit(card);return nodes;};
  const button=text=>all().find(n=>n.tag==='button'&&n.textContent===text);
  const shortcut=option=>all().find(n=>n.tag==='button'&&n._option===option);
  // who asks, then the question; the answer keys, box and send key come before the folded reason/understanding
  assert.equal(card.children[0].textContent,'NOVA ASKS','the caption names who asks');
  assert.equal(card.children[1].textContent,'Walk me through the last update.');
  const order=card.children.map(n=>n.className);
  assert.ok(order.indexOf('tc-actions')<order.indexOf('tc-why')&&order.indexOf('tc-actions')<order.indexOf('tc-understanding'),'the answer comes before the folds: '+order.join(' '));
  assert.ok(all().some(n=>n.className==='tc-hint'&&n.textContent==='Tap one to add it to your answer, then edit or send.'),'one plain line on the starting points');
  assert.equal(button('Send answer').disabled,true);
  // a starting point toggles: in (✓), out again, never a duplicate; typed text is kept
  input.value='I read Slack.';input.events.input();shortcut('A Google Doc').onclick();
  assert.equal(input.value,'I read Slack.\nA Google Doc');assert.equal(sent.length,0,'shortcuts do not auto-send or replace typed context');
  assert.equal(shortcut('A Google Doc').textContent,'✓ A Google Doc');assert.equal(shortcut('A Google Doc').attrs['aria-pressed'],'true');
  shortcut('A Google Doc').onclick();
  assert.equal(input.value,'I read Slack.','a second tap takes it out again');assert.equal(shortcut('A Google Doc').textContent,'A Google Doc');
  shortcut('A Google Doc').onclick();
  assert.equal(input.value.split('\n').filter(l=>l==='A Google Doc').length,1,'never added twice');
  input.value='I read Slack.\nA Google Doc\nSlack';input.events.input();
  assert.equal(shortcut('Slack').attrs['aria-pressed'],'true','typing a starting point shows it as in the answer');
  input.value='I read Slack.\nA Google Doc';input.events.input();
  await button('Send answer').onclick();assert.equal(input.value,'I read Slack.\nA Google Doc','failed send preserves text');
  assert.equal(button('Send answer').disabled,false);
  accept=true;await button('Use your judgment').onclick();
  assert.match(sent.at(-1),/^I read Slack[\s\S]*Use your judgment for the remaining choices\.$/);
  assert.equal(card.attrs['aria-label'],'Shared task context');
  assert.ok(all().some(n=>n.tag==='details'&&n.className==='tc-receipt'&&/^You answered: /.test(n.children[0].textContent)),'answered card folds into a readable receipt');
  assert.ok(all().some(n=>n.tag==='blockquote'&&n.textContent.includes('<script>')),'quoted evidence stays literal text');
  // with no asker the caption keeps its old words
  const plain=ctx.module.exports.TaskConversation.mount(new Element('root'),{question:'q'},async()=>true);
  assert.equal(plain.card.children[0].textContent,'LET’S SHAPE THIS');
  console.log('task-conversation-ui: asker caption, answer-first order, toggling starting points, full text, failed-send retry, delegation and folded receipt passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
