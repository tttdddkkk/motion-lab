/* DOM から要素を取る共通の道具（ビューアとモーションで使う）。
   見つからないときに null のまま進めず、何を探したかが分かる例外にする */

/**
 * 要素を1つ取る。
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement}
 */
export function q(root, selector) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`要素が見つからない: ${selector}`);
  return /** @type {HTMLElement} */ (el);
}

/**
 * 要素をすべて配列で取る。
 * @param {ParentNode} root
 * @param {string} selector
 * @returns {HTMLElement[]}
 */
export function qa(root, selector) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);
}
