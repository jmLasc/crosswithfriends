import {renderToStaticMarkup} from 'react-dom/server';
import ClueText from '../ClueText';

const render = (text: string) => renderToStaticMarkup(<ClueText text={text} />);

describe('ClueText', () => {
  it('renders plain text as a span', () => {
    expect(render('Plain clue')).toBe('<span>Plain clue</span>');
  });

  it('renders allowed HTML tags', () => {
    expect(render('See <i>also</i> 1A')).toBe('<span>See <i>also</i> 1A</span>');
  });

  it('strips disallowed tags but keeps their content', () => {
    expect(render('<script>alert(1)</script>boom')).toBe('<span>alert(1)boom</span>');
  });

  it('italicizes the whole clue when wrapped in double quotes', () => {
    expect(render('""quoted clue""')).toBe('<i>&quot;quoted clue&quot;</i>');
  });

  it('renders **text** as bold', () => {
    expect(render('A **bold** move')).toBe('<span>A <strong>bold</strong> move</span>');
  });

  it('renders *text* as bold (NYT convention)', () => {
    expect(render('An *emphatic* clue')).toBe('<span>An <strong>emphatic</strong> clue</span>');
  });

  it('renders multiple Markdown spans within a single clue', () => {
    expect(render('Put all the b*o*l*d* letters in this clue t*o*gethe*r*?')).toBe(
      '<span>Put all the b<strong>o</strong>l<strong>d</strong> letters in this clue t<strong>o</strong>gethe<strong>r</strong>?</span>'
    );
  });

  it('leaves stray asterisks alone', () => {
    expect(render('5 * 6 = 30')).toBe('<span>5 * 6 = 30</span>');
  });

  it('does not apply emphasis when asterisks hug whitespace', () => {
    expect(render('* not emphasis *')).toBe('<span>* not emphasis *</span>');
  });

  it('renders both ** and * as bold when mixed', () => {
    expect(render('**very** *neat*')).toBe('<span><strong>very</strong> <strong>neat</strong></span>');
  });
});
