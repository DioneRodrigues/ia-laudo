import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';

window.testEditor = new Editor({
  element: document.querySelector('#editor'),
  extensions: [StarterKit],
  content: '<p></p>',
});
