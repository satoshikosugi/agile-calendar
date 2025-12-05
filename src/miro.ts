// Miro Web SDK helper functions
/// <reference types="@mirohq/websdk-types" />

// Access the global miro object from the SDK script
export const miro = (window as any).miro;

export async function initializeMiro() {
  await miro.board.ui.on('icon:click', async () => {
    await miro.board.ui.openPanel({
      url: 'index.html',
      height: 800,
    });
  });
}
