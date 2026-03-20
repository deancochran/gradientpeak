import{j as s}from"./jsx-runtime-BjG_zV1W.js";import{B as m}from"./index.web-9fy3q8Z2.js";import{r as n}from"./index-D78gjQHl.js";import"./index-CFZE-loq.js";import"./index-AlhVH2fP.js";import"./cn-DuMXYCiK.js";import"./_commonjsHelpers-Cpj98o6Y.js";/**
 * @license lucide-react v0.541.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const E=e=>e.replace(/([a-z0-9])([A-Z])/g,"$1-$2").toLowerCase(),R=e=>e.replace(/^([A-Z])|[\s-_]+(\w)/g,(t,r,a)=>a?a.toUpperCase():r.toLowerCase()),u=e=>{const t=R(e);return t.charAt(0).toUpperCase()+t.slice(1)},y=(...e)=>e.filter((t,r,a)=>!!t&&t.trim()!==""&&a.indexOf(t)===r).join(" ").trim(),b=e=>{for(const t in e)if(t.startsWith("aria-")||t==="role"||t==="title")return!0};/**
 * @license lucide-react v0.541.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */var z={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:2,strokeLinecap:"round",strokeLinejoin:"round"};/**
 * @license lucide-react v0.541.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const I=n.forwardRef(({color:e="currentColor",size:t=24,strokeWidth:r=2,absoluteStrokeWidth:a,className:d="",children:o,iconNode:T,...p},j)=>n.createElement("svg",{ref:j,...z,width:t,height:t,stroke:e,strokeWidth:a?Number(r)*24/Number(t):r,className:y("lucide",d),...!o&&!b(p)&&{"aria-hidden":"true"},...p},[...T.map(([k,_])=>n.createElement(k,_)),...Array.isArray(o)?o:[o]]));/**
 * @license lucide-react v0.541.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=(e,t)=>{const r=n.forwardRef(({className:a,...d},o)=>n.createElement(I,{ref:o,iconNode:t,className:y(`lucide-${E(u(e))}`,`lucide-${e}`,a),...d}));return r.displayName=u(e),r};/**
 * @license lucide-react v0.541.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],L=O("chevron-right",U),A=["default","destructive","outline","secondary","ghost","link"],S=["default","sm","lg","icon"],D={title:"Components/Button",component:m,tags:["autodocs"],args:{children:"Continue",variant:"default",size:"default",disabled:!1},argTypes:{size:{control:"select",options:S},variant:{control:"select",options:A}}},i={},c={render:()=>s.jsx("div",{className:"flex flex-wrap items-center gap-3",children:A.map(e=>s.jsx(m,{variant:e,children:e},e))})},l={render:()=>s.jsx("div",{className:"flex flex-wrap items-center gap-3",children:S.map(e=>s.jsx(m,{size:e,variant:e==="icon"?"outline":"default",children:e==="icon"?s.jsx(L,{}):e},e))})};var f,g,h;i.parameters={...i.parameters,docs:{...(f=i.parameters)==null?void 0:f.docs,source:{originalSource:"{}",...(h=(g=i.parameters)==null?void 0:g.docs)==null?void 0:h.source}}};var v,x,w;c.parameters={...c.parameters,docs:{...(v=c.parameters)==null?void 0:v.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-3">
      {BUTTON_VARIANTS.map(variant => <Button key={variant} variant={variant}>
          {variant}
        </Button>)}
    </div>
}`,...(w=(x=c.parameters)==null?void 0:x.docs)==null?void 0:w.source}}};var C,B,N;l.parameters={...l.parameters,docs:{...(C=l.parameters)==null?void 0:C.docs,source:{originalSource:`{
  render: () => <div className="flex flex-wrap items-center gap-3">
      {BUTTON_SIZES.map(size => <Button key={size} size={size} variant={size === "icon" ? "outline" : "default"}>
          {size === "icon" ? <ChevronRight /> : size}
        </Button>)}
    </div>
}`,...(N=(B=l.parameters)==null?void 0:B.docs)==null?void 0:N.source}}};const F=["Playground","Variants","Sizes"];export{i as Playground,l as Sizes,c as Variants,F as __namedExportsOrder,D as default};
