/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

/**
 * The card-network marks shown against each card in the picker —
 * `assets/images/{amex,svb}-icon.svg` in the source.
 *
 * Inlined as components rather than copied in as files: the portal has no
 * SVG-asset pipeline (nothing under `src` imports an `.svg`, and there is no
 * svg plugin in the Vite config), and adding one for two small marks would be
 * more build machinery than they are worth. Everything else in the portal draws
 * its icons from `@wso2/oxygen-ui-icons-react`, which are components too, so
 * this matches how icons already arrive here.
 *
 * The brand colours are fixed on purpose and do not follow the theme — a bank's
 * mark is its own, and recolouring it for dark mode would make it wrong.
 */

const VIEW_BOX = "0 0 800 576";

function AmexIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox={VIEW_BOX} fill="none" aria-hidden focusable="false">
      <rect width="800" height="575.024" rx="40" fill="#26A6D1" />
      <path
        d="M129.001 200L50 374.826H144.575L156.3 346.952H183.099L194.824 374.826H298.924V353.551L308.2 374.826H362.049L371.325 353.102V374.826H587.826L614.152 347.676L638.802 374.826L750.001 375.051L670.751 287.901L750.001 200H640.527L614.9 226.649L591.026 200H355.502L335.277 245.124L314.578 200H220.201V220.551L209.702 200H129.001ZM147.301 224.826H193.401L245.802 343.376V224.826H296.303L336.777 309.826L374.078 224.826H424.327V350.275H393.752L393.502 251.974L348.927 350.275H321.576L276.75 251.974V350.275H213.85L201.926 322.151H137.501L125.601 350.25H91.8996L147.301 224.826ZM452.3 224.826H576.626L614.651 265.9L653.902 224.826H691.927L634.152 287.876L691.927 350.201H652.177L614.152 308.649L574.701 350.201H452.3V224.826ZM169.727 246.051L148.502 296.152H190.928L169.727 246.051ZM483.002 250.8V273.701H550.827V299.225H483.002V324.226H559.077L594.426 287.402L560.577 250.778H483.002V250.8Z"
        fill="white"
      />
    </svg>
  );
}

function SvbIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size * 0.72} viewBox={VIEW_BOX} fill="none" aria-hidden focusable="false">
      <rect width="800" height="575.02" rx="40" fill="#0C3048" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M163.066 286.69C191.867 291.571 226.924 297.42 226.924 335.839C226.924 369.333 199.551 389.531 152.864 389.531C106.178 389.531 78.8047 368.702 78.8047 333.061H118.647C118.647 351.324 131.453 362.054 152.738 362.054C173.521 362.054 185.57 354.395 185.57 340.72C185.57 323.467 166.383 320.227 144.971 316.651C116.716 312.064 82.9191 306.552 82.9191 269.101C82.9191 238.215 109.327 219.659 152.864 219.659C196.36 219.659 222.39 239.52 222.39 273.351H182.589C182.589 256.099 171.883 246.379 152.99 246.379C135.147 246.379 124.441 253.532 124.441 265.567C124.441 280.168 142.158 283.114 162.941 286.69M310.598 370.638L347.88 222.941H393.852L346.326 386.249H274.408L226.924 222.941H272.855L310.136 370.638H310.598ZM502.633 220.121C548.143 220.121 574.089 254.121 574.089 305.079C574.089 355.111 546.128 390.583 502.633 389.994C497.259 389.994 491.927 389.237 486.763 387.764C481.599 386.291 476.687 384.103 472.152 381.242C467.576 378.423 463.462 374.93 459.851 370.932C456.282 366.935 453.26 362.475 450.951 357.636H450.447L434.619 386.249H407.287V135.711H450.153V254.079H450.657C452.672 248.988 455.485 244.191 458.927 239.899C462.412 235.606 466.527 231.903 471.145 228.874C475.721 225.844 480.759 223.572 486.049 222.057C491.381 220.584 496.839 219.911 502.381 220.079L502.633 220.121ZM529.964 305.205C529.964 279.411 519.93 254.121 488.694 254.121C467.744 254.121 455.443 267.544 450.321 284.797C449.817 286.452 449.383 288.121 449.019 289.804C448.655 291.487 448.362 293.185 448.138 294.896C447.886 296.607 447.704 298.318 447.592 300.029C447.48 301.741 447.424 303.466 447.424 305.205C447.424 306.972 447.48 308.74 447.592 310.507C447.704 312.274 447.872 314.028 448.096 315.767C448.348 317.534 448.655 319.273 449.019 320.985C449.383 322.724 449.817 324.435 450.321 326.118C455.863 344.591 469.339 355.91 488.694 355.91C516.194 355.91 529.964 335.165 529.964 305.205Z"
        fill="white"
      />
      <path
        d="M627.368 169.507L736.419 304.408L627.368 439.31L593.484 418.31L657.637 304.408L593.484 190.506L627.368 169.507Z"
        fill="#00C0FF"
      />
    </svg>
  );
}

/**
 * The mark for a card's issuing bank. Anything that is not Amex gets the SVB
 * one, which is the source's own fallback (`CardMenu.tsx:138-158` branches on
 * `amex` and takes SVB for everything else).
 */
export function CcBankIcon({ bankCode, size = 22 }: { bankCode: string; size?: number }) {
  return bankCode.toLowerCase() === "amex" ? <AmexIcon size={size} /> : <SvbIcon size={size} />;
}
