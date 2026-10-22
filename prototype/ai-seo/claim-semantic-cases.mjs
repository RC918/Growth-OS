// New synthetic regression examples; no holdout sentences or labels.
export const semanticCases = [
  {id:'not-with-measurement',text:'Orion is not a toy with a length of 81.28 cm.',source:'Orion length 32 inch.',status:'SUPPORTED'},
  {id:'negative-length',text:'Orion length -32 cm.',source:'Orion length 32 cm.',status:'CONTRADICTED'},
  {id:'availability-unqualified',text:'Orion is available.',source:'Orion is maple.',status:'UNSUPPORTED',type:'commercial'},
  {id:'not-only-uncertain',text:'Orion is not only 32 inch long.',source:'Orion is 32 inch long.',status:'REVIEW'},
  {id:'rounded-sources',text:'Orion length 32.0 inch.',source:'Orion length 32.0 inch. Orion length 81.3 cm.',status:'SUPPORTED'},
  {id:'uncertain-source',text:'Orion length 32 inch.',source:'Orion length about 32 inch.',status:'UNSUPPORTED'},
  {id:'affirmative',text:'The Orion deck is 32 inches long.',source:'The Orion deck is 32 inches long.',status:'SUPPORTED'},
  {id:'unrelated-not-semicolon',text:'Orion is not a toy; it is 81.28 cm long.',source:'Orion is 32 inch long.',status:'SUPPORTED'},
  {id:'unrelated-without-suffix',text:'Orion is 32 inch long without a carrying bag.',source:'Orion is 32 inch long.',status:'SUPPORTED'},
  {id:'unrelated-not-coordination',text:'Orion is not a toy and measures 81.28 cm long.',source:'Orion is 32 inch long.',status:'SUPPORTED'},
  {id:'cjk-clause',text:'Orion 不是玩具，而是 81.28 公分長。',source:'Orion is 32 inch long.',status:'SUPPORTED'},
  {id:'negation-opposite',text:'Orion is not 32 inch long.',source:'Orion is 32 inch long.',status:'CONTRADICTED'},
  {id:'negation-supported',text:'Orion is not 32 inch long.',source:'Orion is not 32 inch long.',status:'SUPPORTED'},
  {id:'negation-unknown',text:'Orion is not 32 inch long.',source:'Orion has a maple deck.',status:'UNSUPPORTED'},
  {id:'source-negative',text:'Orion is waterproof.',source:'Orion is not waterproof.',status:'CONTRADICTED',type:'performance'},
  {id:'source-mixed-polarity',text:'Orion is waterproof.',source:'Orion is waterproof. Orion is not waterproof.',status:'SOURCE_CONFLICT',type:'performance'},
  {id:'cjk-convert',text:'Orion 長度 81.28 公分。',source:'Orion length 32 inch.',status:'SUPPORTED'},
  {id:'cjk-mm',text:'Orion 長度 812.8 毫米。',source:'Orion length 32 inch.',status:'SUPPORTED'},
  {id:'cjk-meter',text:'Orion 長度 0.8128 公尺。',source:'Orion length 32 inch.',status:'SUPPORTED'},
  {id:'cjk-inch',text:'Orion 長度 32 吋。',source:'Orion length 81.28 cm.',status:'SUPPORTED'},
  {id:'known-length-conflict',text:'Orion 長度 70 公分。',source:'Orion length 81.28 cm.',status:'CONTRADICTED'},
  {id:'different-dimension',text:'Orion weight 32 kg.',source:'Orion length 32 cm.',status:'UNSUPPORTED'},
  {id:'different-attribute',text:'Orion width 32 cm.',source:'Orion length 32 cm.',status:'UNSUPPORTED'},
  {id:'unknown-attribute',text:'Orion is 70 cm.',source:'Orion is 81.28 cm.',status:'UNSUPPORTED'},
  {id:'source-length-conflict',text:'Orion length 70 cm.',source:'Orion length 70 cm. Orion length 90 cm.',status:'SOURCE_CONFLICT'},
  {id:'source-conflict-no-match',text:'Orion length 60 cm.',source:'Orion length 70 cm. Orion length 90 cm.',status:'SOURCE_CONFLICT'},
  {id:'cheapest',text:'Orion is the cheapest deck.',source:'Orion is a maple deck.',status:'UNSUPPORTED',type:'commercial'},
  {id:'sale',text:'Orion is on sale.',source:'Orion is a maple deck.',status:'UNSUPPORTED',type:'commercial'},
  {id:'availability',text:'Orion is available now.',source:'Orion is a maple deck.',status:'UNSUPPORTED',type:'commercial'},
  {id:'commercial-stale',text:'Orion is in stock.',source:'Orion is in stock.',status:'REVIEW',type:'commercial'},
  {id:'comparison',text:'Orion is less stable than Comet.',source:'Orion has a stable platform.',status:'UNSUPPORTED',type:'comparison'},
  {id:'comparison-quoted',text:'Orion is less stable than Comet.',source:'Orion is less stable than Comet.',status:'REVIEW',type:'comparison'},
  {id:'purpose-negative-source',text:'Orion is designed for touring.',source:'Orion is not designed for touring.',status:'CONTRADICTED',type:'purpose'},
  {id:'precision-conversion',text:'Orion length 81.3 cm.',source:'Orion length 32.00 inch.',status:'CONTRADICTED'},
  {id:'source-cjk',text:'Orion length 81.28 cm.',source:'Orion 長度 32 英吋。',status:'SUPPORTED'}
];
export function inputFor(c) {
  const fact={value:c.source,citations:['synthetic:E1'],verification:'source_asserted'};
  return {suggestions:{description:{text:c.text,used_fact_ids:['description']}},facts:{facts:{description:fact}}};
}
